process.env.TZ = 'Asia/Phnom_Penh';
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;
const ENV_ADMIN_PIN = (process.env.ADMIN_PIN || '').trim();
const ENV_TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const ENV_SESSION_SECRET = (process.env.SESSION_SECRET || '').trim();

const PASSWORD_PREFIX = 'scrypt$v1$';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${PASSWORD_PREFIX}${salt}$${hash}`;
}

function verifyPassword(password, storedValue) {
  const stored = String(storedValue || '');
  if (!stored.startsWith(PASSWORD_PREFIX)) {
    return safeEqualSecret(String(password || ''), stored);
  }
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const actual = Buffer.from(parts[3], 'hex');
  const candidate = crypto.scryptSync(String(password || ''), parts[2], actual.length);
  return actual.length === candidate.length && crypto.timingSafeEqual(actual, candidate);
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function cleanPlainText(value, maxLength = 500) {
  return String(value || '')
    .replace(/[<>&"'`]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

// Initialize Database (Cloud Turso or local SQLite fallback)
let client;
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (tursoUrl) {
  client = createClient({
    url: tursoUrl,
    authToken: tursoToken
  });
  console.log('🌐 Connected to Turso Cloud Database:', tursoUrl);
} else {
  let dbFile = path.join(__dirname, 'attendance.db');
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
    const tmpDbPath = path.join('/tmp', 'attendance.db');
    try {
      if (!fs.existsSync(tmpDbPath) && fs.existsSync(dbFile)) {
        fs.copyFileSync(dbFile, tmpDbPath);
      }
      dbFile = tmpDbPath;
    } catch (err) {
      console.error('Failed to copy database to /tmp:', err);
    }
  }
  client = createClient({
    url: `file:${dbFile}`
  });
  console.log('📁 Connected to Local SQLite Database file:', dbFile);
}

// Unified Async DB Interface
const db = {
  async all(sql, args = []) {
    const res = await client.execute({ sql, args });
    return res.rows;
  },
  async get(sql, args = []) {
    const res = await client.execute({ sql, args });
    return res.rows[0] || null;
  },
  async run(sql, args = []) {
    const res = await client.execute({ sql, args });
    return {
      lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
      changes: res.rowsAffected
    };
  },
  async execute(sql, args = []) {
    return client.execute({ sql, args });
  }
};

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket.remoteAddress || '';
}

// Database Initialization & Migration
async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_km TEXT,
      name_latin TEXT,
      role TEXT,
      phone TEXT,
      password TEXT DEFAULT '1234',
      gender TEXT,
      dob TEXT,
      national_id TEXT,
      email TEXT,
      address TEXT,
      join_date TEXT,
      emergency_contact TEXT,
      salary_type TEXT DEFAULT 'monthly',
      notes TEXT,
      avatar TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      member_name TEXT,
      member_code TEXT,
      member_role TEXT,
      type TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      latitude REAL,
      longitude REAL,
      distance_meters REAL,
      is_within_range INTEGER DEFAULT 1,
      note TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      member_name TEXT NOT NULL,
      member_code TEXT NOT NULL,
      member_role TEXT,
      request_type TEXT NOT NULL,
      sub_type TEXT,
      date_start TEXT NOT NULL,
      date_end TEXT,
      time_expected TEXT,
      duration_text TEXT,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      admin_response TEXT,
      reviewed_by TEXT,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await db.execute("ALTER TABLE members ADD COLUMN avatar TEXT");
  } catch (e) {
    // Column already exists
  }

  for (const column of ['name_km', 'name_latin']) {
    try {
      await db.execute(`ALTER TABLE members ADD COLUMN ${column} TEXT`);
    } catch (e) {
      // Existing databases may already have this column.
    }
  }

  try {
    await db.execute("ALTER TABLE members ADD COLUMN device_id TEXT");
  } catch (e) {
    // Column already exists
  }

  try {
    await db.execute("ALTER TABLE members ADD COLUMN session_version INTEGER DEFAULT 0");
  } catch (e) {
    // Existing databases may already have this column.
  }

  try {
    await db.execute("ALTER TABLE leave_requests ADD COLUMN tg_message_id INTEGER");
  } catch (e) {
    // Column already exists
  }

  try {
    await db.execute("ALTER TABLE leave_requests ADD COLUMN tg_chat_id TEXT");
  } catch (e) {
    // Column already exists
  }

  // Seed default settings if not exists
  const initSettings = [
    ['office_lat', '11.536445'],
    ['office_lng', '104.886851'],
    ['allowed_radius', '200'], // meters
    ['telegram_token', ''],
    ['telegram_chat_id', '-5037746251'],
    ['telegram_enabled', 'true'],
    ['telegram_leave_chat_id', '-5352852483'],
    ['telegram_leave_enabled', 'true'],
    ['office_qr_token', 'OFFICE-ATTENDANCE-HQ-2026'],
    ['company_name', 'VANN SITHA TRADING CO.,LTD'],
    ['admin_pin', ''],
    ['session_secret', crypto.randomBytes(32).toString('hex')],
    ['wifi_check_enabled', 'true'],
    ['company_wifi_ips', '45.119.135.171, 36.37.169.199']
  ];

  for (const [k, v] of initSettings) {
    const row = await db.get('SELECT value FROM settings WHERE key = ?', [k]);
    if (!row) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
    }
  }

  // Ensure default company Wi-Fi IPs are active if not already set
  const curWifiIps = await db.get('SELECT value FROM settings WHERE key = ?', ['company_wifi_ips']);
  if (!curWifiIps || !curWifiIps.value) {
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['company_wifi_ips', '45.119.135.171, 36.37.169.199']);
  }

  // Seed default members if empty
  const countRow = await db.get('SELECT COUNT(*) as count FROM members');
  if (!countRow || countRow.count === 0) {
    const seed = [
      ['MEM-001', 'សុក វិបុល (Sok Vibol)', 'Project Manager', '012 345 678'],
      ['MEM-002', 'ជា ស្រីនាង (Chea Sreynang)', 'UI/UX Designer', '098 765 432'],
      ['MEM-003', 'Srean Vattana', 'IT Officer', '012 345 678'],
      ['MEM-004', 'វណ្ណ ស៊ីថា (Vann Sitha)', 'CEO / General Manager', '012 000 111']
    ];
    for (const [code, name, role, phone] of seed) {
      await db.run('INSERT INTO members (code, name, role, phone) VALUES (?, ?, ?, ?)', [code, name, role, phone]);
    }
  }

  // One-time transparent migration from legacy plain-text passwords.
  const legacyPasswords = await db.all("SELECT id, password FROM members WHERE password IS NOT NULL AND password NOT LIKE 'scrypt$v1$%'");
  for (const member of legacyPasswords) {
    await db.run('UPDATE members SET password = ? WHERE id = ?', [hashPassword(member.password || '1234'), member.id]);
  }
}

let dbInitPromise = null;
function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = initDb();
  }
  return dbInitPromise;
}

// Middleware
app.use(express.json({ limit: '15mb' }));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  next();
});
app.use(express.urlencoded({ extended: true, limit: '15mb' }));



// Route to always serve the latest index.html whether uploaded to root or public/
app.get('/', (req, res) => {
  const rootIndex = path.join(__dirname, 'index.html');
  const pubIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(rootIndex) && fs.existsSync(pubIndex)) {
    const rootMtime = fs.statSync(rootIndex).mtimeMs;
    const pubMtime = fs.statSync(pubIndex).mtimeMs;
    return res.sendFile(rootMtime >= pubMtime ? rootIndex : pubIndex);
  }
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  if (fs.existsSync(pubIndex)) return res.sendFile(pubIndex);
  res.send('VST Attendance Web App');
});

// Route to always serve the latest app.js whether uploaded to root or public/
app.get('/app.js', (req, res) => {
  const rootApp = path.join(__dirname, 'app.js');
  const pubApp = path.join(__dirname, 'public', 'app.js');
  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  if (fs.existsSync(rootApp) && fs.existsSync(pubApp)) {
    const rootMtime = fs.statSync(rootApp).mtimeMs;
    const pubMtime = fs.statSync(pubApp).mtimeMs;
    return res.sendFile(rootMtime >= pubMtime ? rootApp : pubApp);
  }
  if (fs.existsSync(rootApp)) return res.sendFile(rootApp);
  if (fs.existsSync(pubApp)) return res.sendFile(pubApp);
  res.status(404).send('console.error("app.js not found");');
});

// Serve all other static assets only after the explicit root and app.js routes.
// This prevents stale files in public/ from overriding newer root-level files.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(express.static(__dirname, { index: false }));

// Ensure DB is initialized before processing any route
app.use(async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    console.error('Database connection/init error:', err);
    res.status(500).json({ error: 'Database initialization error: ' + err.message });
  }
});

// Helper: Haversine distance in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const R = 6371e3; // Earth radius in meters
  const radLat1 = lat1 * Math.PI / 180;
  const radLat2 = lat2 * Math.PI / 180;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(radLat1) * Math.cos(radLat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Cambodia (UTC+7 / Asia/Phnom_Penh) Date and Time Helpers
function parseSqliteUtcDate(ts) {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string') {
    if (ts.endsWith('Z') || ts.includes('+')) return new Date(ts);
    return new Date(ts.replace(' ', 'T') + 'Z');
  }
  return new Date(ts);
}

function getCambodiaDateString(dateInput = new Date()) {
  const d = parseSqliteUtcDate(dateInput);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(d);
}

function getCambodiaHoursAndMinutes(dateInput = new Date()) {
  const d = parseSqliteUtcDate(dateInput);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Phnom_Penh',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }
  return { hour, minute, totalMinutes: hour * 60 + minute };
}

function formatCambodiaTime(dateInput = new Date()) {
  const d = parseSqliteUtcDate(dateInput);
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Phnom_Penh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function formatCambodiaDate(dateInput = new Date()) {
  const d = parseSqliteUtcDate(dateInput);
  return d.toLocaleDateString('km-KH', {
    timeZone: 'Asia/Phnom_Penh',
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getCambodiaDayOfWeek(dateInput = new Date()) {
  const d = parseSqliteUtcDate(dateInput);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Phnom_Penh',
    weekday: 'short'
  }).format(d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.indexOf(parts);
}

// Format duration into hours and minutes in Khmer (e.g., 1 ម៉ោង 15 នាទី or 20 នាទី)
function formatDurationKm(totalMins) {
  const mins = Math.abs(Math.round(totalMins || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) {
    return m > 0 ? `${h} ម៉ោង ${m} នាទី` : `${h} ម៉ោង`;
  }
  return `${m} នាទី`;
}

// Helper: Get setting
async function getSetting(key) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

async function getTelegramToken() {
  return ENV_TELEGRAM_BOT_TOKEN || await getSetting('telegram_token');
}

const TELEGRAM_WEBHOOK_URL = (process.env.TELEGRAM_WEBHOOK_URL || 'https://vst-check-in.vercel.app/api/telegram-webhook').trim();
let registeredTelegramWebhookToken = '';

function getTelegramWebhookSecret(token) {
  // Telegram's secret_token is sent back in a request header. Never expose the bot token itself.
  return crypto.createHmac('sha256', token).update('vst-checkin-telegram-webhook-v1').digest('hex');
}

async function ensureTelegramWebhook(token) {
  if (!process.env.VERCEL || registeredTelegramWebhookToken === token) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: TELEGRAM_WEBHOOK_URL,
      secret_token: getTelegramWebhookSecret(token),
      allowed_updates: ['callback_query'],
      drop_pending_updates: false
    }),
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || 'Could not register Telegram webhook');
  }
  registeredTelegramWebhookToken = token;
}

function safeEqualSecret(candidate, expected) {
  const candidateBuffer = Buffer.from(String(candidate || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  if (!expectedBuffer.length || candidateBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

async function getSessionSecret() {
  if (ENV_SESSION_SECRET) return ENV_SESSION_SECRET;
  const row = await db.get("SELECT value FROM settings WHERE key = 'session_secret'");
  return row && row.value ? row.value : '';
}

async function createSessionToken(payload, ttlSeconds) {
  const secret = await getSessionSecret();
  if (!secret) throw new Error('Session secret is not configured');
  const body = base64UrlJson({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

async function readSessionToken(token) {
  try {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return null;
    const secret = await getSessionSecret();
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (!safeEqualSecret(signature, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function bearerToken(req) {
  const value = req.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function requireAuth(req, res, next) {
  const session = await readSessionToken(bearerToken(req));
  if (!session) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  if (session.role === 'staff') {
    const member = await db.get('SELECT status, session_version FROM members WHERE id = ?', [session.memberId]);
    if (!member || member.status !== 'active' || Number(member.session_version || 0) !== Number(session.sessionVersion || 0)) {
      return res.status(401).json({ error: 'Session is no longer valid. Please sign in again.' });
    }
  }
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin authorization required' });
  }
  next();
}

function requireStaffOrAdmin(req, res, next) {
  if (!req.session || !['staff', 'admin'].includes(req.session.role)) {
    return res.status(403).json({ error: 'Authorization required' });
  }
  next();
}

function ensureStaffOwnsCode(req, res, code) {
  if (req.session.role === 'admin') return true;
  if (String(req.session.code || '').toLowerCase() !== String(code || '').trim().toLowerCase()) {
    res.status(403).json({ error: 'You can only access your own attendance account.' });
    return false;
  }
  return true;
}

const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const identity = cleanPlainText(req.body && (req.body.code || req.body.pin), 80).toLowerCase() || 'admin';
  const key = `${getClientIp(req) || 'unknown'}:${identity}`;
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(ts => now - ts < 15 * 60 * 1000);
  if (recent.length >= 10) {
    return res.status(429).json({ error: 'សាកចូលច្រើនដងពេក។ សូមរង់ចាំ 15 នាទី រួចសាកម្តងទៀត។' });
  }
  recent.push(now);
  loginAttempts.set(key, recent);
  next();
}

function clearLoginAttempts(req) {
  const identity = cleanPlainText(req.body && (req.body.code || req.body.pin), 80).toLowerCase() || 'admin';
  loginAttempts.delete(`${getClientIp(req) || 'unknown'}:${identity}`);
}

const registrationAttempts = new Map();
function registrationRateLimit(req, res, next) {
  const key = getClientIp(req) || 'unknown';
  const now = Date.now();
  const recent = (registrationAttempts.get(key) || []).filter(ts => now - ts < 60 * 60 * 1000);
  if (recent.length >= 5) {
    return res.status(429).json({ error: 'បានផ្ញើសំណើច្រើនពេក។ សូមរង់ចាំមួយម៉ោង រួចសាកម្តងទៀត។' });
  }
  recent.push(now);
  registrationAttempts.set(key, recent);
  next();
}

// Helper: Escape HTML special characters for Telegram HTML parse_mode
function escapeTg(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Keep Telegram alerts compact while preserving names and staff-written notes.
function tgText(value, fallback = '—') {
  return escapeTg(String(value ?? '').replace(/&#(?:x20|32);/gi, ' ').replace(/\s+/g, ' ').trim() || fallback);
}

function formatTelegramDate(dateInput = new Date()) {
  return parseSqliteUtcDate(dateInput).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Phnom_Penh', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function formatTelegramTime(dateInput = new Date()) {
  return parseSqliteUtcDate(dateInput).toLocaleTimeString('en-US', {
    timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function tgShortChoice(value, fallback = 'ទូទៅ') {
  const source = String(value || '').trim().split('(')[0].trim();
  const choices = {
    'Sick Leave': 'ច្បាប់ឈឺ',
    'Personal Leave': 'ធុរៈផ្ទាល់ខ្លួន',
    'Annual Leave': 'ច្បាប់ប្រចាំឆ្នាំ',
    'Family Leave': 'ធុរៈគ្រួសារ',
    'Traffic Jam': 'ស្ទះចរាចរណ៍',
    'Breakdown': 'ខូចយានជំនិះ',
    'Heavy Rain': 'ភ្លៀងធ្លាក់ខ្លាំង',
    Emergency: 'ធុរៈបន្ទាន់',
    Other: 'ផ្សេងៗ'
  };
  return tgText(choices[source] || source, fallback);
}

const tgKhMonths = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];

function tgKhDate(value) {
  const source = String(value || '').trim();
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return tgText(source);
  return `${Number(match[3])} ${tgKhMonths[Number(match[2]) - 1]} ${match[1]}`;
}

function tgKhDateRange(start, end) {
  if (!end || end === start) return tgKhDate(start);
  const first = String(start || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const last = String(end || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (first && last && first[1] === last[1] && first[2] === last[2]) {
    return `${Number(first[3])}–${Number(last[3])} ${tgKhMonths[Number(first[2]) - 1]} ${first[1]}`;
  }
  return `${tgKhDate(start)} → ${tgKhDate(end)}`;
}

function parseTgKhDate(value) {
  const source = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source;
  const match = source.match(/^(\d{1,2})(?:[–-]\d{1,2})?\s+([^\s]+)\s+(\d{4})/);
  if (!match) return source;
  const month = tgKhMonths.indexOf(match[2]) + 1;
  return month ? `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}` : source;
}

function parseTgKhDateRange(value) {
  const source = String(value || '').split('·')[0].trim();
  const compact = source.match(/^(\d{1,2})[–-](\d{1,2})\s+([^\s]+)\s+(\d{4})$/);
  if (compact) {
    const month = tgKhMonths.indexOf(compact[3]) + 1;
    if (month) {
      const prefix = `${compact[4]}-${String(month).padStart(2, '0')}-`;
      return {
        start: prefix + compact[1].padStart(2, '0'),
        end: prefix + compact[2].padStart(2, '0')
      };
    }
  }
  const [start, end] = source.split(/\s*→\s*/);
  return { start: parseTgKhDate(start), end: parseTgKhDate(end || start) };
}

function tgKhTime(value) {
  const source = String(value || '').trim();
  const match = source.match(/^(\d{1,2}:\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (!match) return tgText(source);
  return `${match[1]} ${match[2].toUpperCase() === 'AM' ? 'ព្រឹក' : 'រសៀល'}`;
}

function tgKhDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} ម៉ោង${rest ? ` ${rest} នាទី` : ''}` : `${rest} នាទី`;
}

function tgDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
}

function tgLeaveDuration(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/Full Day|ថ្ងៃពេញ/i.test(source)) return 'ពេញមួយថ្ងៃ';
  return tgShortChoice(source);
}

function tgRequestDate(request) {
  const date = tgKhDateRange(request.date_start, request.date_end);
  const time = request.request_type === 'late' && request.time_expected
    ? ` · ${tgKhTime(request.time_expected)}` : '';
  const duration = request.request_type === 'leave' && request.duration_text
    ? ` · ${tgLeaveDuration(request.duration_text)}` : '';
  return `${date}${time}${duration}`;
}

function formatTelegramRequest(request, status = 'pending', response = '') {
  const type = request.request_type === 'late' ? 'សំណើសុំមកយឺត' : 'សំណើសុំច្បាប់';
  const heading = status === 'pending' ? `🔔 <b>${type}</b>`
    : `${status === 'approved' ? '✅' : '❌'} <b>${status === 'approved' ? 'អនុម័ត' : 'បដិសេធ'}${type}</b>`;
  const detail = tgShortChoice(request.sub_type, type);
  const lines = [
    `${heading} · #${tgText(request.id)}`,
    `👤 <b>${tgText(request.member_name)}</b> · <code>${tgText(request.member_code)}</code>`,
    `📌 ${detail} · ${tgRequestDate(request)}`
  ];
  if (status === 'pending') {
    lines.push(`📝 ${tgText(request.reason)}`);
  } else {
    if (response && !/^(?:Approved(?: in Telegram)?|Rejected(?: in Telegram)?|Okay! បានយល់ព្រម|មិនអនុម័ត|អនុម័ត|បដិសេធ|បានអនុម័ត|បានបដិសេធ|អនុម័តតាម Telegram|បដិសេធតាម Telegram)$/i.test(response.trim())) {
      lines.push(`💬 ${tgText(response)}`);
    }
  }
  return lines.join('\n');
}

// Helper: Send Telegram notification to OLD / MAIN Group (-5037746251)
async function sendTelegramMessage(text) {
  const token = await getTelegramToken();
  const chatId = await getSetting('telegram_chat_id');
  const enabled = await getSetting('telegram_enabled');

  const targetChatId = (chatId && chatId.trim()) ? chatId.trim() : '-5037746251';

  if (enabled === 'false' || !token || !targetChatId) {
    return { success: false, reason: 'Telegram is not configured or disabled' };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: text,
        parse_mode: 'HTML'
      }),
      signal: AbortSignal.timeout(5000)
    });
    const result = await res.json();
    return { success: result.ok, data: result };
  } catch (err) {
    console.error('Failed to send Telegram message:', err.message);
    return { success: false, error: err.message };
  }
}

// Helper: Send Telegram notification to dedicated Leave / Late Permissions Group (-5352852483)
async function sendTelegramLeaveMessage(text, replyMarkup = null) {
  const token = await getTelegramToken();
  const leaveChatId = await getSetting('telegram_leave_chat_id');
  const leaveEnabled = await getSetting('telegram_leave_enabled');

  if (leaveEnabled === 'false') {
    return { success: false, reason: 'Leave Telegram alerts are disabled' };
  }

  // Target the dedicated Leave Group (-5352852483)
  const targetChatId = (leaveChatId && leaveChatId.trim()) ? leaveChatId.trim() : '-5352852483';

  if (!token || !targetChatId) {
    return { success: false, reason: 'Telegram Leave Chat ID or Token is not configured' };
  }

  try {
    await ensureTelegramWebhook(token);
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = {
      chat_id: targetChatId,
      text: text,
      parse_mode: 'HTML'
    };
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });
    const result = await res.json();
    return { success: result.ok, data: result };
  } catch (err) {
    console.error('Failed to send Telegram leave message:', err.message);
    return { success: false, error: err.message };
  }
}

async function isTelegramGroupAdmin(token, chatId, userId) {
  if (!chatId || !userId) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/getChatAdministrators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId }),
    signal: AbortSignal.timeout(5000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok || !Array.isArray(result.result)) {
    throw new Error(result.description || 'Could not verify Telegram group admins');
  }
  return result.result.some(member => String(member.user?.id) === String(userId)
    && ['creator', 'administrator'].includes(member.status));
}

// Helper: Answer Telegram Callback Query (Show Alert or Toast in Telegram App)
async function answerTelegramCallback(token, callbackQueryId, text, showAlert = false) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert
      })
    });
  } catch (err) {
    console.error('Failed to answer callback query:', err.message);
  }
}

// Helper: Remove Inline Buttons from Telegram Group Message
async function removeTelegramInlineButtons(token, chatId, messageId) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] }
      })
    });
  } catch (err) {
    console.error('Failed to remove inline buttons:', err.message);
  }
}

async function updateTelegramRequestMessage(token, chatId, messageId, text) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] }
      })
    });
    const result = await response.json();
    if (!result.ok) throw new Error(result.description || 'Telegram edit failed');
  } catch (err) {
    console.error('Failed to update Telegram request:', err.message);
    await removeTelegramInlineButtons(token, chatId, messageId);
  }
}

// Helper: Handle Telegram Callback Query from Leaders (Inline Buttons: Approve / Reject)
async function handleTelegramCallbackQuery(cq, token) {
  try {
    if (!cq || !cq.data) return;
    const dataStr = cq.data;
    if (!dataStr.startsWith('leave_approve:') && !dataStr.startsWith('leave_reject:')) {
      return;
    }

    const [action, idStr] = dataStr.split(':');
    const requestId = parseInt(idStr, 10);
    if (!requestId) return;

    const leaveChatId = ((await getSetting('telegram_leave_chat_id')) || '-5352852483').trim();
    const callbackChatId = cq.message?.chat?.id;
    if (String(callbackChatId) !== leaveChatId) {
      await answerTelegramCallback(token, cq.id, 'សំណើនេះមិនមែនមកពី Group សុំច្បាប់ទេ', true);
      return;
    }

    let authorized = false;
    try {
      authorized = await isTelegramGroupAdmin(token, callbackChatId, cq.from?.id);
    } catch (err) {
      console.error('Could not verify Telegram approver:', err.message);
      await answerTelegramCallback(token, cq.id, 'មិនអាចផ្ទៀងផ្ទាត់សិទ្ធិបាន។ សូមព្យាយាមម្ដងទៀត', true);
      return;
    }
    if (!authorized) {
      await answerTelegramCallback(token, cq.id, 'មានតែ Admin ក្នុង Group នេះទើបអាចអនុម័តបាន', true);
      return;
    }

    await ensureDb();
    const existing = await db.get("SELECT * FROM leave_requests WHERE id = ?", [requestId]);
    if (!existing) {
      await answerTelegramCallback(token, cq.id, 'រកមិនឃើញសំណើនេះក្នុងប្រព័ន្ធទេ', true);
      return;
    }

    const from = cq.from || {};
    const leaderName = [from.first_name, from.last_name].filter(Boolean).join(' ') || (from.username ? '@' + from.username : 'មេដឹកនាំ (Leader)');

    // If already processed
    if (existing.status !== 'pending') {
      await answerTelegramCallback(token, cq.id, `សំណើនេះត្រូវបាន${existing.status === 'approved' ? 'អនុម័ត' : 'បដិសេធ'}រួចហើយ`, true);
      if (cq.message && cq.message.chat) {
        await removeTelegramInlineButtons(token, cq.message.chat.id, cq.message.message_id);
      }
      return;
    }

    const isApprove = action === 'leave_approve';
    const newStatus = isApprove ? 'approved' : 'rejected';
    const adminResponse = isApprove ? 'អនុម័តតាម Telegram' : 'បដិសេធតាម Telegram';

    // 1. Update SQLite DB
    const decision = await db.run(`
      UPDATE leave_requests 
      SET status = ?, admin_response = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `, [newStatus, adminResponse, leaderName, requestId]);
    if (!decision.changes) {
      await answerTelegramCallback(token, cq.id, 'សំណើនេះត្រូវបានពិនិត្យរួចហើយ', true);
      return;
    }

    // 2. Answer callback query popup in Telegram
    await answerTelegramCallback(
      token, 
      cq.id, 
      isApprove ? `✅ អនុម័ត៖ ${existing.member_name}` : `❌ បដិសេធ៖ ${existing.member_name}`,
      true
    );

    const decisionOldGroupMsg = formatTelegramRequest(existing, newStatus, adminResponse);

    try {
      await sendTelegramMessage(decisionOldGroupMsg);
    } catch (err) {
      console.error('Error sending decision to old group:', err);
    }

    // 4. UPDATE THE MESSAGE IN THE NEW GROUP (-5352852483): REMOVE BUTTONS & SHOW DECISION
    if (cq.message && cq.message.chat) {
      const updatedNewGroupText = formatTelegramRequest(existing, newStatus, adminResponse);
      await updateTelegramRequestMessage(token, cq.message.chat.id, cq.message.message_id, updatedNewGroupText);
    }
  } catch (err) {
    console.error('Error in handleTelegramCallbackQuery:', err);
  }
}

// Long Polling for Telegram Interactive Buttons
let tgPollingActive = false;
let lastUpdateId = 0;

async function startTelegramPolling() {
  if (tgPollingActive) return;
  tgPollingActive = true;
  console.log('🤖 Telegram Long Polling active for Leave/Late interactive buttons...');

  while (tgPollingActive) {
    try {
      const token = await getTelegramToken();
      if (!token) {
        await new Promise(r => setTimeout(r, 6000));
        continue;
      }

      const pollUrl = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=20&allowed_updates=["callback_query"]`;
      const res = await fetch(pollUrl);
      if (!res.ok) {
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          if (update.callback_query) {
            handleTelegramCallbackQuery(update.callback_query, token).catch(e => console.error('Callback error:', e));
          }
        }
      }
    } catch (err) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}

// Webhook for Telegram updates (Serverless & Direct Callback Support)
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const token = await getTelegramToken();
    if (!token) return res.status(503).json({ ok: false });
    const suppliedSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
    if (!safeEqualSecret(suppliedSecret, getTelegramWebhookSecret(token))) {
      return res.status(403).json({ ok: false });
    }
    const update = req.body;
    if (update && update.callback_query) {
      await handleTelegramCallbackQuery(update.callback_query, token);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ ok: false });
  }
});

// ================= API ROUTES =================

// Public Info (for staff mobile app)
app.get('/api/public-info', async (req, res) => {
  try {
    const companyName = await getSetting('company_name');
    const officeLat = await getSetting('office_lat');
    const officeLng = await getSetting('office_lng');
    const allowedRadius = await getSetting('allowed_radius');
    const wifiCheckEnabled = (await getSetting('wifi_check_enabled')) !== 'false';

    res.json({
      companyName: companyName || 'VANN SITHA TRADING CO.,LTD',
      officeLat: parseFloat(officeLat),
      officeLng: parseFloat(officeLng),
      allowedRadius: parseFloat(allowedRadius) || 200,
      wifiCheckEnabled,
      members: []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time Network Status (Check client IP against Company Wi-Fis)
app.get('/api/network-status', async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const wifiCheckEnabled = (await getSetting('wifi_check_enabled')) !== 'false';
    const allowedIpsStr = (await getSetting('company_wifi_ips')) || '45.119.135.171, 36.37.169.199';
    const allowedIps = allowedIpsStr.split(',').map(s => s.trim()).filter(Boolean);

    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.');
    const isAllowed = !wifiCheckEnabled || allowedIps.includes(clientIp) || isLocal;

    let matchedName = null;
    if (clientIp === '45.119.135.171') {
      matchedName = 'Wi-Fi ទី ១ (45.119.135.171)';
    } else if (clientIp === '36.37.169.199') {
      matchedName = 'Wi-Fi ទី ២ (36.37.169.199)';
    } else if (allowedIps.includes(clientIp)) {
      matchedName = `Wi-Fi ក្រុមហ៊ុន (${clientIp})`;
    } else if (isLocal) {
      matchedName = 'Local Development / Office LAN';
    }

    res.json({
      clientIp,
      isCompanyWifi: isAllowed,
      matchedName,
      wifiCheckEnabled,
      allowedNetworkCount: allowedIps.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin verify PIN
app.post('/api/admin/verify-pin', loginRateLimit, async (req, res) => {
  const { pin } = req.body;
  const currentPin = ENV_ADMIN_PIN || await getSetting('admin_pin');
  if (safeEqualSecret(pin, currentPin)) {
    clearLoginAttempts(req);
    const token = await createSessionToken({ role: 'admin' }, 8 * 60 * 60);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'លេខកូដសម្ងាត់ PIN មិនត្រឹមត្រូវទេ!' });
  }
});

// 1. Dashboard summary (Admin)
app.get('/api/dashboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalMembersRow = await db.get("SELECT COUNT(*) as count FROM members WHERE status = 'active'");
    const totalMembers = totalMembersRow ? totalMembersRow.count : 0;
    
    const todayCheckInsRow = await db.get(`
      SELECT COUNT(DISTINCT member_id) as count 
      FROM attendance 
      WHERE (type = 'morning_in' OR type = 'check_in') AND date(timestamp, '+7 hours') = date('now', '+7 hours')
    `);
    const todayCheckIns = todayCheckInsRow ? todayCheckInsRow.count : 0;

    const todayCheckOutsRow = await db.get(`
      SELECT COUNT(DISTINCT member_id) as count 
      FROM attendance 
      WHERE (type = 'evening_out' OR type = 'check_out') AND date(timestamp, '+7 hours') = date('now', '+7 hours')
    `);
    const todayCheckOuts = todayCheckOutsRow ? todayCheckOutsRow.count : 0;

    const recent = await db.all(`
      SELECT * FROM attendance 
      ORDER BY timestamp DESC 
      LIMIT 10
    `);

    const officeQrToken = await getSetting('office_qr_token');
    const companyName = await getSetting('company_name');

    res.json({
      totalMembers,
      todayCheckIns,
      todayCheckOuts,
      absentCount: Math.max(0, totalMembers - todayCheckIns),
      recentLogs: recent,
      officeQrToken: officeQrToken || 'OFFICE-ATTENDANCE-HQ-2026',
      companyName: companyName || 'VANN SITHA TRADING CO.,LTD'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Staff-facing aggregate: no phone numbers, birthdays, passwords or private notes.
app.get('/api/staff/team-overview', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const today = getCambodiaDateString();
    const todayDate = new Date(`${today}T00:00:00Z`);
    const day = todayDate.getUTCDay();
    const weekStartDate = new Date(todayDate);
    weekStartDate.setUTCDate(todayDate.getUTCDate() - (day === 0 ? 6 : day - 1));
    const weekStart = weekStartDate.toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;

    const members = await db.all("SELECT id, name, name_km, name_latin FROM members WHERE status = 'active'");
    const logs = await db.all(`
      SELECT a.member_id, a.type, a.timestamp, date(a.timestamp, '+7 hours') AS work_date
      FROM attendance a JOIN members m ON m.id = a.member_id
      WHERE m.status = 'active' AND date(a.timestamp, '+7 hours') BETWEEN ? AND ?
      ORDER BY a.timestamp ASC
    `, [monthStart < weekStart ? monthStart : weekStart, today]);

    const todayPresent = new Set(logs.filter(log => log.work_date === today).map(log => Number(log.member_id))).size;
    const slotAliases = {
      check_in: 'morning_in', morning_in: 'morning_in',
      lunch_out: 'lunch_out', afternoon_in: 'afternoon_in',
      check_out: 'evening_out', evening_out: 'evening_out'
    };
    const isPunctual = (slot, minutes) =>
      (slot === 'morning_in' && minutes <= 490) ||
      (slot === 'lunch_out' && minutes >= 650) ||
      (slot === 'afternoon_in' && minutes <= 790) ||
      (slot === 'evening_out' && minutes >= 1010);

    const rankFor = (startDate) => {
      const byMember = new Map();
      for (const log of logs) {
        if (log.work_date < startDate) continue;
        const slot = slotAliases[log.type];
        if (!slot) continue;
        const memberId = Number(log.member_id);
        if (!byMember.has(memberId)) byMember.set(memberId, new Map());
        const days = byMember.get(memberId);
        if (!days.has(log.work_date)) days.set(log.work_date, new Map());
        const slots = days.get(log.work_date);
        // The first entry for each slot counts; repeat taps never add points.
        if (!slots.has(slot)) slots.set(slot, getCambodiaHoursAndMinutes(log.timestamp).totalMinutes);
      }
      return members.map(member => {
        const days = byMember.get(Number(member.id)) || new Map();
        let completedDays = 0;
        let punctualSlots = 0;
        for (const slots of days.values()) {
          if (slots.size === 4) completedDays++;
          for (const [slot, minutes] of slots) {
            if (isPunctual(slot, minutes)) punctualSlots++;
          }
        }
        const daysPresent = days.size;
        return {
          name: member.name_km || member.name,
          nameLatin: member.name_latin || '',
          daysPresent,
          completedDays,
          punctualSlots,
          score: punctualSlots + completedDays * 2,
          punctualityPercent: daysPresent ? Math.round(100 * punctualSlots / (daysPresent * 4)) : 0
        };
      }).filter(row => row.daysPresent > 0)
        .sort((a, b) => b.score - a.score || b.completedDays - a.completedDays || b.punctualSlots - a.punctualSlots || b.daysPresent - a.daysPresent || a.name.localeCompare(b.name))
        .slice(0, 5);
    };

    res.json({
      totalMembers: members.length,
      todayPresent,
      today,
      week: { startDate: weekStart, endDate: today, leaders: rankFor(weekStart) },
      month: { startDate: monthStart, endDate: today, leaders: rankFor(monthStart) }
    });
  } catch (err) {
    console.error('Team overview error:', err);
    res.status(500).json({ error: 'មិនអាចទាញយកស្ថិតិក្រុមបានទេ' });
  }
});

// 2. Members Management (Admin)
app.get('/api/members', requireAuth, requireAdmin, async (req, res) => {
  try {
    const members = await db.all("SELECT id, code, name, name_km, name_latin, role, phone, gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar, status, device_id, created_at FROM members WHERE status != 'pending' OR status IS NULL ORDER BY id DESC");
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members', requireAuth, requireAdmin, async (req, res) => {
  const { 
    code, name, role, phone, password, 
    gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar 
  } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Code and Name are required' });
  }

  if (!password || password.trim().length < 4) {
    return res.status(400).json({ error: 'Password must contain at least 4 characters' });
  }

  const memberPassword = hashPassword(password.trim());

  try {
    const info = await db.run(`
      INSERT INTO members (
        code, name, role, phone, password,
        gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      cleanPlainText(code, 40).toUpperCase(),
      cleanPlainText(name, 160),
      cleanPlainText(role, 120),
      cleanPlainText(phone, 40),
      memberPassword,
      gender || '',
      dob || '',
      national_id ? national_id.trim() : '',
      email ? email.trim() : '',
      address ? address.trim() : '',
      join_date || '',
      emergency_contact ? emergency_contact.trim() : '',
      salary_type || 'monthly',
      notes ? notes.trim() : '',
      avatar || ''
    ]);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'លេខកូដសមាជិក (Member Code) នេះមានរួចហើយ!' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/members/:id', requireAuth, requireAdmin, async (req, res) => {
  const { 
    code, name, role, phone, password, 
    gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar 
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const currentMember = await db.get('SELECT * FROM members WHERE id = ?', [req.params.id]);
    if (!currentMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const memberPassword = (password && password.trim()) ? hashPassword(password.trim()) : currentMember.password;
    const memberCode = (code && code.trim()) ? code.trim().toUpperCase() : currentMember.code;
    const memberAvatar = (avatar !== undefined) ? avatar : (currentMember.avatar || '');

    await db.run(`
      UPDATE members SET
        code = ?, name = ?, role = ?, phone = ?, password = ?,
        gender = ?, dob = ?, national_id = ?, email = ?, address = ?, join_date = ?, emergency_contact = ?, salary_type = ?, notes = ?, avatar = ?
      WHERE id = ?
    `, [
      memberCode,
      name.trim(),
      role ? role.trim() : '',
      phone ? phone.trim() : '',
      memberPassword,
      gender || '',
      dob || '',
      national_id ? national_id.trim() : '',
      email ? email.trim() : '',
      address ? address.trim() : '',
      join_date || '',
      emergency_contact ? emergency_contact.trim() : '',
      salary_type || 'monthly',
      notes ? notes.trim() : '',
      memberAvatar,
      req.params.id
    ]);

    if (password && password.trim()) {
      await db.run('UPDATE members SET session_version = COALESCE(session_version, 0) + 1 WHERE id = ?', [req.params.id]);
    }

    res.json({ success: true });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'លេខកូដសមាជិក (Member Code) នេះមានរួចហើយ!' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Staff Self-Service: Update profile photo (Name is NOT editable)
app.post('/api/staff/update-avatar', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { code, avatar } = req.body;
    if (avatar && String(avatar).length > 3_000_000) {
      return res.status(413).json({ error: 'រូបថតធំពេក។ សូមជ្រើសរូបតូចជាង 2MB។' });
    }
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Staff code is required' });
    }
    if (!ensureStaffOwnsCode(req, res, code)) return;
    const member = await db.get('SELECT id, name FROM members WHERE code = ? COLLATE NOCASE', [code.trim()]);
    if (!member) {
      return res.status(404).json({ error: 'រកមិនឃើញសមាជិកបុគ្គលិកនេះទេ' });
    }
    await db.run('UPDATE members SET avatar = ? WHERE id = ?', [avatar || '', member.id]);
    res.json({ success: true, avatar: avatar || '' });
  } catch (err) {
    console.error('Error updating staff avatar:', err);
    res.status(500).json({ error: 'បរាជ័យក្នុងការរក្សាទុករូបថត' });
  }
});

app.delete('/api/members/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM members WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= STAFF SELF-REGISTRATION & DEVICE BINDING =================

// 1. Staff Self-Registration (starts in 'pending' status for Admin approval)
app.post('/api/members/self-register', registrationRateLimit, async (req, res) => {
  try {
    const { name_km, name_latin, phone, dob, join_date, role, password, avatar, device_id } = req.body;
    if (avatar && String(avatar).length > 3_000_000) {
      return res.status(413).json({ error: 'រូបថតធំពេក។ សូមជ្រើសរូបតូចជាង 2MB។' });
    }
    const nameKm = cleanPlainText(name_km, 160);
    const nameLatin = cleanPlainText(name_latin, 160);
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!nameKm || !nameLatin) {
      return res.status(400).json({ error: 'សូមបញ្ចូលឈ្មោះជាភាសាខ្មែរ និងឈ្មោះជាអក្សរឡាតាំង' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'សូមបញ្ចូលលេខទូរស័ព្ទបុគ្គលិក (Phone Number)' });
    }
    if (!validDate(dob) || dob > getCambodiaDateString() || !validDate(join_date)) {
      return res.status(400).json({ error: 'សូមបញ្ចូលថ្ងៃកំណើត និងថ្ងៃចូលធ្វើការឱ្យបានត្រឹមត្រូវ' });
    }

    // Check duplicate phone or name
    const cleanPhone = phone.trim().replace(/\s+/g, '');
    const existing = await db.get(
      "SELECT id, code, name, status FROM members WHERE replace(phone, ' ', '') = ? OR name = ? COLLATE NOCASE OR name_latin = ? COLLATE NOCASE",
      [cleanPhone, nameKm, nameLatin]
    );
    if (existing) {
      if (existing.status === 'pending') {
        return res.status(400).json({
          error: `គណនីឈ្មោះ "${existing.name}" បានដាក់ពាក្យរួចហើយ និងកំពុងរង់ចាំ Admin អនុម័ត (Pending Approval)។`
        });
      } else {
        return res.status(400).json({
          error: `គណនីឈ្មោះ "${existing.name}" (${existing.code}) មានក្នុងប្រព័ន្ធរួចហើយ! សូមចូល Login ឬទាក់ទង Admin។`
        });
      }
    }

    // Generate next sequential code: MEM-00x
    const allCodes = await db.all("SELECT code FROM members WHERE code LIKE 'MEM-%'");
    let maxNum = 0;
    for (const row of allCodes) {
      const match = row.code.match(/MEM-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const nextCode = `MEM-${String(maxNum + 1).padStart(3, '0')}`;
    if (!password || password.trim().length < 4) {
      return res.status(400).json({ error: 'សូមបង្កើត Password យ៉ាងតិច 4 តួអក្សរ' });
    }
    const memberPwd = hashPassword(password.trim());

    const insertResult = await db.run(`
      INSERT INTO members (code, name, name_km, name_latin, role, phone, dob, join_date, password, avatar, device_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      nextCode,
      nameKm,
      nameKm,
      nameLatin,
      role ? role.trim() : 'បុគ្គលិក',
      phone.trim(),
      dob,
      join_date,
      memberPwd,
      avatar || '',
      device_id || null
    ]);

    // Send Instant Alert to Telegram
    const tgMsg = `
🔔 <b>New staff · Pending</b>
👤 <b>${tgText(nameKm)}</b> (${tgText(nameLatin)}) · <code>${tgText(nextCode)}</code>
💼 ${tgShortChoice(role, 'Staff')}
📱 ${tgText(phone)}
    `.trim();

    sendTelegramMessage(tgMsg).catch(err => console.error('Telegram alert failed:', err));

    res.json({
      success: true,
      member: {
        id: insertResult.lastInsertRowid,
        code: nextCode,
        name: nameKm,
        nameLatin,
        role: role ? role.trim() : 'បុគ្គលិក',
        status: 'pending'
      },
      message: 'ការចុះឈ្មោះបានជោគជ័យ! ព័ត៌មានរបស់អ្នកត្រូវបានបញ្ជូនទៅ Admin ដើម្បីអនុម័ត។'
    });
  } catch (err) {
    console.error('Error in /api/members/self-register:', err);
    res.status(500).json({ error: 'បរាជ័យក្នុងការចុះឈ្មោះ: ' + err.message });
  }
});

// 2. Admin: Get all pending registration requests
app.get('/api/members/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const list = await db.all("SELECT id, code, name, name_km, name_latin, role, phone, dob, join_date, avatar, device_id, created_at FROM members WHERE status = 'pending' ORDER BY id DESC");
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Admin: Approve pending member
app.post('/api/members/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const member = await db.get("SELECT * FROM members WHERE id = ? AND status = 'pending'", [req.params.id]);
    if (!member) {
      return res.status(404).json({ error: 'រកមិនឃើញការស្នើសុំសមាជិកនេះទេ' });
    }

    await db.run("UPDATE members SET status = 'active' WHERE id = ?", [req.params.id]);

    // Send Telegram broadcast
    const tgMsg = `
✅ <b>Staff approved</b>
👤 <b>${tgText(member.name)}</b> · <code>${tgText(member.code)}</code>
💼 ${tgShortChoice(member.role, 'Staff')}
    `.trim();
    sendTelegramMessage(tgMsg).catch(err => console.error('Telegram approval alert failed:', err));

    res.json({ success: true, message: `បានអនុម័តសមាជិក ${member.name} (${member.code}) ដោយជោគជ័យ!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Admin: Reject pending member
app.post('/api/members/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const member = await db.get("SELECT * FROM members WHERE id = ? AND status = 'pending'", [req.params.id]);
    if (!member) {
      return res.status(404).json({ error: 'រកមិនឃើញការស្នើសុំសមាជិកនេះទេ' });
    }

    await db.run("DELETE FROM members WHERE id = ? AND status = 'pending'", [req.params.id]);
    res.json({ success: true, message: `បានបដិសេធការស្នើសុំរបស់ ${member.name}!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Admin: Reset member device lock (allow employee to bind a new device)
app.post('/api/members/:id/reset-device', requireAuth, requireAdmin, async (req, res) => {
  try {
    const member = await db.get("SELECT id, name, code FROM members WHERE id = ?", [req.params.id]);
    if (!member) {
      return res.status(404).json({ error: 'រកមិនឃើញសមាជិកនេះទេ' });
    }

    await db.run("UPDATE members SET device_id = NULL, session_version = COALESCE(session_version, 0) + 1 WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: `បានដោះសោទូរស័ព្ទ (Device Reset) សម្រាប់ ${member.name} រួចរាល់! បុគ្គលិកអាចប្រើទូរស័ព្ទថ្មីបាន។` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Login (By Member Code / Selection + Password set by Admin)
app.post('/api/members/login', loginRateLimit, async (req, res) => {
  const { code, password, device_id } = req.body;
  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'សូមជ្រើសរើសឈ្មោះបុគ្គលិក ឬបញ្ចូលលេខកូដ ID' });
  }

  const member = await db.get('SELECT * FROM members WHERE code = ? COLLATE NOCASE OR phone = ? COLLATE NOCASE', [code.trim(), code.trim()]);
  if (!member) {
    return res.status(404).json({ error: `រកមិនឃើញគណនីដែលមានកូដ "${code}" ទេ! សូមទាក់ទង Admin ឬចុះឈ្មោះថ្មី។` });
  }

  // Check Approval Status
  if (member.status === 'pending') {
    return res.status(403).json({
      error: `⏳ គណនីរបស់អ្នក (${member.name}) កំពុងរង់ចាំ Admin អនុម័ត (Pending Approval)។ សូមរង់ចាំ Admin ពិនិត្យ និងចុចអនុម័តសិន!`
    });
  }
  if (member.status === 'rejected' || member.status === 'inactive') {
    return res.status(403).json({
      error: '⛔ គណនីនេះត្រូវបានផ្អាក ឬបដិសេធ។ សូមទាក់ទង Admin!'
    });
  }

  // Password verification
  const inputPwd = (password || '').trim();
  const actualPwd = member.password || '';

  if (!inputPwd) {
    return res.status(400).json({ error: 'សូមបញ្ចូលលេខកូដសម្ងាត់ Password!' });
  }

  if (!verifyPassword(inputPwd, actualPwd)) {
    return res.status(401).json({ error: 'លេខកូដសម្ងាត់ Password មិនត្រឹមត្រូវទេ! សូមទាក់ទង Admin បើអ្នកភ្លេច។' });
  }

  clearLoginAttempts(req);
  if (!String(actualPwd).startsWith(PASSWORD_PREFIX)) {
    await db.run('UPDATE members SET password = ? WHERE id = ?', [hashPassword(inputPwd), member.id]);
  }

  // Check 1 Staff = 1 Device restriction
  if (device_id) {
    if (!member.device_id) {
      await db.run('UPDATE members SET device_id = ? WHERE id = ?', [device_id, member.id]);
      member.device_id = device_id;
    } else if (member.device_id !== device_id) {
      return res.status(403).json({
        error: `⚠️ គណនីនេះត្រូវបានភ្ជាប់ជាមួយទូរស័ព្ទផ្សេងរួចហើយ! (បុគ្គលិកម្នាក់អាចប្រើបានតែទូរស័ព្ទមួយប៉ុណ្ណោះ)\n\nប្រសិនបើអ្នកបានប្តូរទូរស័ព្ទថ្មី សូមទាក់ទង Admin ដើម្បីដោះសោ Device។`,
        isDeviceLocked: true
      });
    }
  }

  // Return safe member object (without exposing password)
  const safeMember = { ...member };
  delete safeMember.password;
  delete safeMember.session_version;
  const token = await createSessionToken({ role: 'staff', memberId: member.id, code: member.code, deviceId: member.device_id || device_id || '', sessionVersion: Number(member.session_version || 0) }, 30 * 24 * 60 * 60);
  res.json({ success: true, member: safeMember, token });
});

app.post('/api/attendance/check', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { code, type, qr_token, latitude, longitude, note, check_method } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'សូមបញ្ជាក់លេខកូដសមាជិក (Member Code)' });
    }
    if (!ensureStaffOwnsCode(req, res, code)) return;

    // Client IP & Company Wi-Fi verification
    const clientIp = getClientIp(req);
    const wifiCheckEnabled = (await getSetting('wifi_check_enabled')) !== 'false';
    const allowedIpsStr = (await getSetting('company_wifi_ips')) || '45.119.135.171, 36.37.169.199';
    const allowedIps = allowedIpsStr.split(',').map(s => s.trim()).filter(Boolean);
    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.');
    const isCompanyWifi = !wifiCheckEnabled || allowedIps.includes(clientIp) || isLocal;

    const isButtonCheck = check_method === 'wifi_button' || !qr_token;

    // If using One-Click Button or Wi-Fi is strictly enabled:
    if (isButtonCheck) {
      if (wifiCheckEnabled && !isCompanyWifi) {
        return res.status(403).json({
          error: `⚠️ មិនទាន់ភ្ជាប់ Wi-Fi ក្រុមហ៊ុនទេ! (IP របស់អ្នក: ${clientIp || 'មិនស្គាល់'})\nសូមភ្ជាប់ Wi-Fi ទី១ ឬទី២ របស់ក្រុមហ៊ុនដើម្បីចុចកត់ត្រាវត្តមាន។`,
          isWifiBlocked: true,
          clientIp
        });
      }
    } else {
      // Verify Office QR token if provided
      const expectedToken = (await getSetting('office_qr_token')) || 'OFFICE-ATTENDANCE-HQ-2026';
      if (qr_token && qr_token.trim() !== expectedToken.trim()) {
        return res.status(400).json({ error: 'QR Code មិនត្រឹមត្រូវទេ! សូមស្កេន QR Code ការិយាល័យផ្លូវការ។' });
      }
    }

    const member = await db.get('SELECT * FROM members WHERE code = ? COLLATE NOCASE', [code.trim()]);
    if (!member) {
      return res.status(404).json({ error: `រកមិនឃើញសមាជិកដែលមានកូដ "${code}" ទេ!` });
    }

    // Check Approval Status
    if (member.status === 'pending') {
      return res.status(403).json({
        error: `⏳ គណនីរបស់អ្នក (${member.name}) កំពុងរង់ចាំការអនុម័តពី Admin (Pending Approval)។ សូមរង់ចាំ Admin ពិនិត្យ និងចុចអនុម័តសិន!`
      });
    }
    if (member.status === 'rejected' || member.status === 'inactive') {
      return res.status(403).json({
        error: '⛔ គណនីរបស់អ្នកត្រូវបានផ្អាក ឬបដិសេធ។ សូមទាក់ទង Admin!'
      });
    }

    // Check 1 Staff = 1 Device restriction
    const { device_id } = req.body;
    if (req.session.role === 'staff' && (!device_id || device_id !== req.session.deviceId)) {
      return res.status(403).json({ error: 'ឧបករណ៍នេះមិនត្រូវនឹង Login Session ទេ។ សូមចាកចេញ ហើយ Login ម្តងទៀត។' });
    }
    if (device_id) {
      if (!member.device_id) {
        await db.run('UPDATE members SET device_id = ? WHERE id = ?', [device_id, member.id]);
        member.device_id = device_id;
      } else if (member.device_id !== device_id) {
        return res.status(403).json({
          error: `⚠️ គណនីនេះត្រូវបានភ្ជាប់ជាមួយទូរស័ព្ទផ្សេងរួចហើយ! (បុគ្គលិកម្នាក់អាចប្រើបានតែទូរស័ព្ទមួយប៉ុណ្ណោះ)\n\nប្រសិនបើអ្នកបានប្តូរទូរស័ព្ទថ្មី សូមទាក់ទង Admin ដើម្បីដោះសោ Device។`,
          isDeviceLocked: true
        });
      }
    }

    // Normalize action type (4 scans per day: morning_in, lunch_out, afternoon_in, evening_out)
    // Strict max 4 scans check per day (Cambodia time)
    const todayKhDate = getCambodiaDateString();
    const todayExisting = await db.all(`
      SELECT * FROM attendance 
      WHERE member_id = ? AND date(timestamp, '+7 hours') = ?
      ORDER BY timestamp ASC
    `, [member.id, todayKhDate]);

    if (todayExisting.length >= 4) {
      return res.status(400).json({
        error: 'អ្នកបានស្កេនគ្រប់ចំនួន ៤ ដង (4/4) សម្រាប់ថ្ងៃនេះរួចរាល់ហើយ! មិនអាចស្កេនបន្ថែមទៀតបានទេ។',
        alreadyMax: true
      });
    }

    let actionType = type;
    if (!actionType || actionType === 'auto') {
      if (todayExisting.length === 0) actionType = 'morning_in';
      else if (todayExisting.length === 1) actionType = 'lunch_out';
      else if (todayExisting.length === 2) actionType = 'afternoon_in';
      else if (todayExisting.length === 3) actionType = 'evening_out';
    } else {
      if (type === 'morning_in' || type === 'check_in') actionType = 'morning_in';
      else if (type === 'lunch_out') actionType = 'lunch_out';
      else if (type === 'afternoon_in') actionType = 'afternoon_in';
      else if (type === 'evening_out' || type === 'check_out') actionType = 'evening_out';
    }

    // Strict Geofencing Check
    const officeLat = parseFloat(await getSetting('office_lat'));
    const officeLng = parseFloat(await getSetting('office_lng'));
    const allowedRadius = parseFloat(await getSetting('allowed_radius')) || 200;

    let distance = null;
    let isWithinRange = 1;

    if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null && !isNaN(officeLat) && !isNaN(officeLng)) {
      distance = calculateDistance(latitude, longitude, officeLat, officeLng);
      if (!isCompanyWifi && distance !== null && distance > allowedRadius) {
        isWithinRange = 0;
        return res.status(400).json({
          error: `អ្នកនៅក្រៅបរិវេណការិយាល័យ (${distance} ម៉ែត្រ)! ប្រព័ន្ធអនុញ្ញាតត្រឹមតែ ${allowedRadius} ម៉ែត្រប៉ុណ្ណោះ។ សូមចូលទៅក្នុងបរិវេណការិយាល័យដើម្បីស្កេនវត្តមាន។`,
          distance: distance,
          allowedRadius: allowedRadius
        });
      }
    } else if (!isCompanyWifi && !isNaN(officeLat) && !isNaN(officeLng) && officeLat !== 0 && officeLng !== 0) {
      // If user did not provide GPS and is not on company Wi-Fi
      return res.status(400).json({
        error: 'សូមបើក Location (GPS Permission) លើទូរស័ព្ទរបស់អ្នក ដើម្បីផ្ទៀងផ្ទាត់ចម្ងាយការិយាល័យមុនពេលស្កេន!'
      });
    }

    // Calculate Cambodia Time (UTC+7) & Punctual / Late / Early departure status
    const { hour: hours, minute: minutes, totalMinutes } = getCambodiaHoursAndMinutes();

    let isLate = false;
    let isEarlyLeave = false;
    let diffMinutes = 0;
    let statusText = '🟢✨ <b>ស្ថានភាព:</b> ទាន់ពេលវេលា (On-Time)';

    // Slot Schedule Rules:
    // 1. morning_in: Target 08:00 (480 mins). Grace 10 mins (up to 08:10 = 490 mins). Late if > 490.
    // 2. lunch_out: Target 11:00 (660 mins). Early threshold 10:50 (650 mins). Early if < 650.
    // 3. afternoon_in: Target 13:00 (780 mins). Grace 10 mins (up to 13:10 = 790 mins). Late if > 790.
    // 4. evening_out: Target 17:00 (1020 mins). Early threshold 16:50 (1010 mins). Early if < 1010.

    if (actionType === 'morning_in') {
      if (totalMinutes > 490) { // After 08:10
        isLate = true;
        diffMinutes = totalMinutes - 480;
        statusText = `🔴⚠️ <b>ស្ថានភាព:</b> មកយឺត (${formatDurationKm(diffMinutes)})`;
      } else if (totalMinutes <= 480) {
        const earlyMins = 480 - totalMinutes;
        statusText = earlyMins > 0 
          ? `🟢✨ <b>ស្ថានភាព:</b> មកទាន់ពេល (មកមុន ${formatDurationKm(earlyMins)})` 
          : `🟢✨ <b>ស្ថានភាព:</b> មកទាន់ពេលវេលា (On-Time)`;
      } else {
        statusText = `🟢✨ <b>ស្ថានភាព:</b> មកទាន់ពេលវេលា (ក្នុងអនុគ្រោះ 10 នាទី)`;
      }
    } else if (actionType === 'lunch_out') {
      if (totalMinutes < 650) { // Before 10:50
        isEarlyLeave = true;
        diffMinutes = 660 - totalMinutes;
        statusText = `🟠🏃💨 <b>ស្ថានភាព:</b> ចេញមុនម៉ោង (${formatDurationKm(diffMinutes)})`;
      } else {
        statusText = `🟢🍱 <b>ស្ថានភាព:</b> ចេញសម្រាកបាយតាមកាលវិភាគ`;
      }
    } else if (actionType === 'afternoon_in') {
      if (totalMinutes > 790) { // After 13:10
        isLate = true;
        diffMinutes = totalMinutes - 780;
        statusText = `🔴⚠️ <b>ស្ថានភាព:</b> មកយឺត (${formatDurationKm(diffMinutes)})`;
      } else if (totalMinutes <= 780) {
        const earlyMins = 780 - totalMinutes;
        statusText = earlyMins > 0 
          ? `🟢✨ <b>ស្ថានភាព:</b> ចូលទាន់ពេល (មុន ${formatDurationKm(earlyMins)})` 
          : `🟢✨ <b>ស្ថានភាព:</b> ចូលទាន់ពេលវេលា (On-Time)`;
      } else {
        statusText = `🟢✨ <b>ស្ថានភាព:</b> ចូលទាន់ពេលវេលា (ក្នុងអនុគ្រោះ 10 នាទី)`;
      }
    } else if (actionType === 'evening_out') {
      if (totalMinutes < 1010) { // Before 16:50
        isEarlyLeave = true;
        diffMinutes = 1020 - totalMinutes;
        statusText = `🟠🏃💨 <b>ស្ថានភាព:</b> ចេញមុនម៉ោង (${formatDurationKm(diffMinutes)})`;
      } else {
        statusText = `🟢🏠 <b>ស្ថានភាព:</b> ចេញធ្វើការតាមកាលវិភាគ`;
      }
    }

    // Require reason if late or early leave
    const trimmedNote = cleanPlainText(note, 500);
    if ((isLate || isEarlyLeave) && !trimmedNote) {
      const diffStr = formatDurationKm(diffMinutes);
      return res.status(400).json({
        error: isLate 
          ? `អ្នកមកយឺត ${diffStr}! សូមបញ្ជាក់មូលហេតុដែលអ្នកមកយឺត។` 
          : `អ្នកចេញមុនម៉ោង ${diffStr}! សូមបញ្ជាក់មូលហេតុដែលអ្នកចេញមុនម៉ោង។`,
        requiresReason: true,
        reasonType: isLate ? 'late' : 'early',
        diffMinutes: diffMinutes,
        diffFormatted: diffStr,
        actionType
      });
    }

    // Record attendance
    const recordResult = await db.run(`
      INSERT INTO attendance (
        member_id, member_name, member_code, member_role,
        type, latitude, longitude, distance_meters, is_within_range, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      member.id,
      member.name,
      member.code,
      member.role,
      actionType,
      latitude || null,
      longitude || null,
      distance,
      isWithinRange,
      trimmedNote
    ]);

    const todayScansCount = todayExisting.length + 1;
    const now = new Date();
    const isSunday = getCambodiaDayOfWeek(now) === 0;

    const slotMeta = {
      morning_in: { labelKm: 'ព្រឹកចូលធ្វើការ (08:00)', labelEn: 'Morning Check-In', num: '1/4', badge: '🌅' },
      lunch_out: { labelKm: 'ចេញសម្រាកបាយ (11:00)', labelEn: 'Lunch Break Out', num: '2/4', badge: '🍱' },
      afternoon_in: { labelKm: 'រសៀលចូលធ្វើការវិញ (13:00)', labelEn: 'Afternoon Return In', num: '3/4', badge: '☕' },
      evening_out: { labelKm: 'ល្ងាចចេញធ្វើការ (17:00)', labelEn: 'Evening Check-Out', num: '4/4', badge: '🏠' }
    };

    const meta = slotMeta[actionType] || { labelKm: actionType, labelEn: actionType, num: `${todayScansCount}/4`, badge: '📌' };
    const typeLabel = `${meta.badge} ${meta.labelKm} [${meta.num}]`;

    const isCheckIn = actionType === 'morning_in' || actionType === 'afternoon_in';
    const targetMinutes = actionType === 'morning_in' ? 480 : 780;
    let attendanceStatus = 'Good';
    let statusIcon = isCheckIn ? '🟢' : '🔵';
    if (isLate) {
      attendanceStatus = `Late ${tgDuration(diffMinutes)}`;
      statusIcon = '🔴';
    } else if (isEarlyLeave) {
      attendanceStatus = `Early ${tgDuration(diffMinutes)}`;
      statusIcon = '🟠';
    } else if (isCheckIn && totalMinutes < targetMinutes) {
      attendanceStatus = `Early ${tgDuration(targetMinutes - totalMinutes)}`;
    }

    const telegramMsg = [
      `<b>${tgText(member.name)}</b> ${isCheckIn ? 'checked in' : 'checked out'} ${statusIcon} <b>${attendanceStatus}</b>`,
      `Date Time: ${formatTelegramDate(now)} ${formatTelegramTime(now)}`,
      trimmedNote ? `Reason: ${tgText(trimmedNote)}` : null
    ].filter(Boolean).join('\n');

    // Finish the notification before returning: serverless runtimes may pause
    // background work as soon as the HTTP response has been sent.
    let telegramSent = false;
    try {
      const telegramResult = await sendTelegramMessage(telegramMsg);
      telegramSent = telegramResult.success === true;
      if (!telegramSent) {
        console.warn('Attendance Telegram notification was not confirmed for record', recordResult.lastInsertRowid);
      }
    } catch (err) {
      // The attendance row is already saved. Never report it as failed or
      // encourage another check-in solely because Telegram was unavailable.
      console.error('Attendance Telegram notification failed for record', recordResult.lastInsertRowid, err);
    }

    res.json({
      success: true,
      telegramSent,
      message: `${typeLabel} ជោគជ័យ!`,
      attendanceId: recordResult.lastInsertRowid,
      member: {
        name: member.name,
        code: member.code,
        role: member.role
      },
      actionType,
      todayScansCount,
      timestamp: new Date().toISOString(),
      distance,
      isWithinRange,
      isSunday,
      statusText,
      note: trimmedNote
    });
  } catch (err) {
    console.error('Error in /api/attendance/check:', err);
    res.status(500).json({
      error: 'មានបញ្ហាក្នុងការកត់ត្រាវត្តមាន: ' + (err.message || 'Server error')
    });
  }
});

// 4. Employee Today 4-Slot Summary (Smart detector)
app.get('/api/attendance/today-summary', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }
  if (!ensureStaffOwnsCode(req, res, code)) return;

  const member = await db.get('SELECT * FROM members WHERE code = ? COLLATE NOCASE', [code.trim()]);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const todayKhDate = getCambodiaDateString();
  const todayLogs = await db.all(`
    SELECT * FROM attendance 
    WHERE member_id = ? AND date(timestamp, '+7 hours') = ?
    ORDER BY timestamp ASC
  `, [member.id, todayKhDate]);

  // Group by slots
  const slots = {
    morning_in: null,
    lunch_out: null,
    afternoon_in: null,
    evening_out: null
  };

  for (const log of todayLogs) {
    if (log.type === 'morning_in' || log.type === 'check_in') {
      if (!slots.morning_in) slots.morning_in = log;
    } else if (log.type === 'lunch_out') {
      if (!slots.lunch_out) slots.lunch_out = log;
    } else if (log.type === 'afternoon_in') {
      if (!slots.afternoon_in) slots.afternoon_in = log;
    } else if (log.type === 'evening_out' || log.type === 'check_out') {
      slots.evening_out = log;
    }
  }

  // Calculate next suggested scan slot
  let nextSuggestedSlot = 'morning_in';
  if (todayLogs.length >= 4) {
    nextSuggestedSlot = 'completed';
  } else if (!slots.morning_in) {
    nextSuggestedSlot = 'morning_in';
  } else if (!slots.lunch_out) {
    nextSuggestedSlot = 'lunch_out';
  } else if (!slots.afternoon_in) {
    nextSuggestedSlot = 'afternoon_in';
  } else if (!slots.evening_out) {
    nextSuggestedSlot = 'evening_out';
  } else {
    nextSuggestedSlot = 'completed';
  }

  const isSunday = getCambodiaDayOfWeek() === 0;

  res.json({
    member: { id: member.id, code: member.code, name: member.name },
    slots,
    totalScansToday: Math.min(4, todayLogs.length),
    isMaxReached: todayLogs.length >= 4,
    nextSuggestedSlot,
    isSunday,
    schedule: 'ចន្ទ - សៅរិ៍ (08:00 - 11:00 | 13:00 - 17:00)',
    todayLogs
  });
});

// 4. Attendance History (Admin & Staff)
app.get('/api/attendance', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { date, startDate, endDate, month, member_id, code, limit = 500 } = req.query;
    if (req.session.role === 'staff' && !ensureStaffOwnsCode(req, res, code)) return;
    let query = 'SELECT * FROM attendance WHERE 1=1';
    const params = [];

    if (startDate && endDate) {
      query += " AND date(timestamp, '+7 hours') >= ? AND date(timestamp, '+7 hours') <= ?";
      params.push(startDate, endDate);
    } else if (date) {
      query += " AND date(timestamp, '+7 hours') = ?";
      params.push(date);
    } else if (month) {
      query += " AND strftime('%Y-%m', datetime(timestamp, '+7 hours')) = ?";
      params.push(month);
    }

    if (member_id) {
      query += ' AND member_id = ?';
      params.push(member_id);
    }
    if (code) {
      query += ' AND (member_code = ? COLLATE NOCASE OR member_id IN (SELECT id FROM members WHERE phone = ? OR code = ? COLLATE NOCASE))';
      params.push(code.trim(), code.trim(), code.trim());
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(Math.min(parseInt(limit) || 500, 5000));

    const records = await db.all(query, params);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Settings (Admin)
app.get('/api/settings', requireAuth, requireAdmin, async (req, res) => {
  const rows = await db.all('SELECT * FROM settings');
  const settingsObj = {};
  for (const r of rows) {
    if (r.key === 'telegram_token' || r.key === 'admin_pin' || r.key === 'session_secret') continue;
    settingsObj[r.key] = r.value;
  }
  settingsObj.telegram_token_configured = Boolean(await getTelegramToken());
  settingsObj.admin_pin_managed = Boolean(ENV_ADMIN_PIN);
  res.json(settingsObj);
});

app.post('/api/settings', requireAuth, requireAdmin, async (req, res) => {
  const { 
    office_lat, office_lng, allowed_radius, 
    telegram_token, telegram_chat_id, telegram_enabled,
    telegram_leave_chat_id, telegram_leave_enabled,
    office_qr_token, company_name, admin_pin,
    wifi_check_enabled, company_wifi_ips
  } = req.body;

  const saveSetting = async (k, v) => {
    if (v !== undefined) {
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, String(v)]);
    }
  };

  await saveSetting('office_lat', office_lat);
  await saveSetting('office_lng', office_lng);
  await saveSetting('allowed_radius', allowed_radius);
  if (!ENV_TELEGRAM_BOT_TOKEN && telegram_token !== undefined && telegram_token !== '') {
    await saveSetting('telegram_token', telegram_token);
  }
  await saveSetting('telegram_chat_id', telegram_chat_id);
  await saveSetting('telegram_enabled', telegram_enabled);
  await saveSetting('telegram_leave_chat_id', telegram_leave_chat_id);
  await saveSetting('telegram_leave_enabled', telegram_leave_enabled);
  await saveSetting('office_qr_token', office_qr_token);
  await saveSetting('company_name', company_name);
  if (!ENV_ADMIN_PIN && admin_pin !== undefined && admin_pin !== '') {
    await saveSetting('admin_pin', admin_pin);
  }
  await saveSetting('wifi_check_enabled', wifi_check_enabled);
  await saveSetting('company_wifi_ips', company_wifi_ips);

  res.json({ success: true, message: 'បានរក្សាទុកការកំណត់ជោគជ័យ' });
});

// 6. Test Telegram Connection
app.post('/api/settings/test-telegram', requireAuth, requireAdmin, async (req, res) => {
  const testMsg = '✅ <b>Attendance alerts connected</b>\nVANN SITHA TRADING';

  const result = await sendTelegramMessage(testMsg);
  if (result.success) {
    res.json({ success: true, message: 'សារសាកល្បងបានផ្ញើទៅ Telegram រួចរាល់!' });
  } else {
    res.status(400).json({ error: result.reason || result.error || 'មិនអាចផ្ញើសារបានទេ។ សូមពិនិត្យ Token និង Chat ID ឡើងវិញ' });
  }
});

// 6.1 Test Dedicated Telegram Leave Group
app.post('/api/settings/test-telegram-leave', requireAuth, requireAdmin, async (req, res) => {
  const testMsg = '✅ <b>Leave alerts connected</b>\nVANN SITHA TRADING';

  const result = await sendTelegramLeaveMessage(testMsg);
  if (result.success) {
    res.json({ success: true, message: 'សារតេស្តបានផ្ញើទៅកាន់ Group សុំច្បាប់ដោយជោគជ័យ!' });
  } else {
    res.status(400).json({ error: result.reason || result.error || 'មិនអាចផ្ញើសារបានទេ។ សូមពិនិត្យមើល Leave Chat ID ឡើងវិញ' });
  }
});

// ================= LEAVE & LATE PERMISSION REQUESTS API =================

// 6.2 Submit Leave or Late Request (Staff Web App)
app.post('/api/leave-requests', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { 
      code, 
      request_type, 
      sub_type, 
      date_start, 
      date_end, 
      time_expected, 
      duration_text, 
      reason 
    } = req.body;

    const staffCode = (req.body.code || req.body.member_code || '').trim();
    if (!staffCode || !request_type || !date_start || !reason || !reason.trim()) {
      return res.status(400).json({ error: 'សូមបំពេញព័ត៌មានចាំបាច់៖ កូដបុគ្គលិក, ប្រភេទសំណើ, កាលបរិច្ឆេទ, និងមូលហេតុ' });
    }
    if (!ensureStaffOwnsCode(req, res, staffCode)) return;

    let member = await db.get("SELECT * FROM members WHERE code = ? COLLATE NOCASE", [staffCode]);
    if (!member) {
      member = {
        id: req.body.member_id || null,
        name: req.body.member_name || staffCode,
        code: staffCode,
        role: req.body.member_role || 'បុគ្គលិក'
      };
    }

    const cleanReason = cleanPlainText(reason, 1000);
    const cleanDuration = cleanPlainText(duration_text || (request_type === 'leave' ? '1 ថ្ងៃ' : 'មកយឺត'), 120);

    // Auto-calculate end date if user requested multiple days
    let finalEndDate = date_end || date_start;
    if (request_type === 'leave' && (!date_end || date_end === date_start)) {
      if (cleanDuration.includes('2 ថ្ងៃ')) {
        const d = new Date(date_start);
        d.setDate(d.getDate() + 1);
        finalEndDate = d.toISOString().slice(0, 10);
      } else if (cleanDuration.includes('3 ថ្ងៃ')) {
        const d = new Date(date_start);
        d.setDate(d.getDate() + 2);
        finalEndDate = d.toISOString().slice(0, 10);
      }
    }

    const result = await db.run(`
      INSERT INTO leave_requests (
        member_id, member_name, member_code, member_role,
        request_type, sub_type, date_start, date_end,
        time_expected, duration_text, reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      member.id, member.name, member.code, member.role || 'បុគ្គលិក',
      request_type, sub_type || 'ទូទៅ', date_start, finalEndDate || null,
      time_expected || null, cleanDuration, cleanReason
    ]);

    const requestId = result.lastInsertRowid;

    // Format Telegram Alert for the dedicated Leave Group (-5352852483) with Inline Buttons
    const telegramAlert = formatTelegramRequest({
      id: requestId, member_name: member.name, member_code: member.code,
      request_type, sub_type, date_start, date_end: finalEndDate,
      time_expected, duration_text: cleanDuration, reason: cleanReason
    });

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ អនុម័ត', callback_data: `leave_approve:${requestId}` },
          { text: '❌ បដិសេធ', callback_data: `leave_reject:${requestId}` }
        ]
      ]
    };

    try {
      const sendRes = await sendTelegramLeaveMessage(telegramAlert, inlineKeyboard);
      if (sendRes && sendRes.data && sendRes.data.result) {
        const msgId = sendRes.data.result.message_id;
        const chatId = sendRes.data.result.chat.id;
        await db.run("UPDATE leave_requests SET tg_message_id = ?, tg_chat_id = ? WHERE id = ?", [msgId, String(chatId), requestId]);
      }
    } catch (err) {
      console.error('Telegram leave alert error:', err);
    }

    res.json({
      success: true,
      message: 'សំណើរបស់អ្នកត្រូវបានផ្ញើជូន Admin & Group Telegram ដោយជោគជ័យ!',
      requestId,
      status: 'pending'
    });
  } catch (err) {
    console.error('Error submitting leave request:', err);
    res.status(500).json({ error: 'បរាជ័យក្នុងការផ្ញើសំណើ: ' + err.message });
  }
});

// 6.3 Get Leave Requests (Admin with filters)
app.get('/api/leave-requests', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, type, code, limit = 200 } = req.query;
    let sql = 'SELECT * FROM leave_requests WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (type && type !== 'all') {
      sql += ' AND request_type = ?';
      params.push(type);
    }
    if (code) {
      sql += ' AND member_code = ? COLLATE NOCASE';
      params.push(code.trim());
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const rows = await db.all(sql, params);
    
    // Count pending
    const pendingCountRow = await db.get("SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'");
    const pendingCount = pendingCountRow ? pendingCountRow.count : 0;

    res.json({
      requests: rows,
      pendingCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6.4 Get Staff's Own Leave Requests (Staff view / my status)
app.get('/api/leave-requests/my', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }
    if (!ensureStaffOwnsCode(req, res, code)) return;

    const rows = await db.all(`
      SELECT * FROM leave_requests 
      WHERE member_code = ? COLLATE NOCASE 
      ORDER BY created_at DESC LIMIT 50
    `, [code.trim()]);

    res.json({ requests: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6.5 Admin Review / Approve / Reject Request & Send Notification to Staff and Telegram
app.post('/api/leave-requests/:id/review', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_response, reviewed_by } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status ត្រូវតែជា approved ឬ rejected' });
    }

    const existing = await db.get("SELECT * FROM leave_requests WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({ error: 'រកមិនឃើញសំណើនេះទេ' });
    }

    const cleanResponse = (admin_response || (status === 'approved' ? 'បានអនុម័ត' : 'បានបដិសេធ')).trim();
    const reviewer = reviewed_by || 'Admin';

    await db.run(`
      UPDATE leave_requests 
      SET status = ?, admin_response = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, cleanResponse, reviewer, id]);

    const decisionTelegram = formatTelegramRequest(existing, status, cleanResponse);

    // Broadcast to the OLD / MAIN Telegram Group!
    try {
      await sendTelegramMessage(decisionTelegram);
    } catch (err) {
      console.error('Telegram decision to old group error:', err);
    }

    // Reflect the decision in the request group and remove its action buttons.
    if (existing.tg_message_id && existing.tg_chat_id) {
      getTelegramToken().then(tok => {
        if (tok) updateTelegramRequestMessage(tok, existing.tg_chat_id, existing.tg_message_id, decisionTelegram);
      }).catch(e => console.error(e));
    }

    res.json({
      success: true,
      message: status === 'approved' ? 'បានអនុម័ត (OK) ដោយជោគជ័យ!' : 'បានបដិសេធសំណើដោយជោគជ័យ!',
      status,
      admin_response: cleanResponse
    });
  } catch (err) {
    console.error('Error reviewing leave request:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Daily Evening Summary Report (Calculation & Formatting)
async function generateDailySummaryReport() {
  const now = new Date();
  const todayKhDate = getCambodiaDateString(now);

  // Get all active members
  const activeMembers = await db.all("SELECT * FROM members WHERE status = 'active' ORDER BY name ASC");
  const totalCount = activeMembers.length;

  // Get all attendance logs for today (Cambodia date)
  const todayLogs = await db.all(`
    SELECT * FROM attendance 
    WHERE date(timestamp, '+7 hours') = ?
    ORDER BY timestamp ASC
  `, [todayKhDate]);

  // Group logs by member
  const memberLogsMap = {};
  for (const log of todayLogs) {
    if (!memberLogsMap[log.member_id]) {
      memberLogsMap[log.member_id] = [];
    }
    memberLogsMap[log.member_id].push(log);
  }

  const presentList = [];
  const lateList = [];
  const onTimeList = [];
  const absentList = [];
  const incompleteList = [];

  for (const member of activeMembers) {
    const logs = memberLogsMap[member.id] || [];
    if (logs.length === 0) {
      // Absent (no scans at all)
      absentList.push(member);
    } else {
      presentList.push(member);

      // Find first morning_in scan
      const morningLog = logs.find(l => l.type === 'morning_in' || l.type === 'check_in') || logs[0];
      if (morningLog) {
        const timeFormat = formatTelegramTime(morningLog.timestamp);
        const { hour: h, minute: m } = getCambodiaHoursAndMinutes(morningLog.timestamp);

        // Schedule is 08:00 with 10 mins grace (late if > 08:10)
        if (h > 8 || (h === 8 && m > 10)) {
          const lateMinutes = (h - 8) * 60 + m;
          const reasonText = morningLog.note ? ` · ${tgText(morningLog.note)}` : '';
          lateList.push({
            member,
            lateMinutes,
            time: timeFormat,
            scansCount: logs.length,
            reason: reasonText
          });
        } else {
          onTimeList.push(member);
        }
      } else {
        onTimeList.push(member);
      }

      // Check if finished 4 scans
      if (logs.length < 4) {
        incompleteList.push({
          member,
          scansCount: logs.length
        });
      }
    }
  }

  // Format Latecomers Text
  const summaryLines = [
    `📊 <b>សរុបវត្តមាន</b> · ${tgKhDate(todayKhDate)}`,
    `👥 សរុប ${totalCount} នាក់ · ✅ វត្តមាន ${presentList.length} · ⚠️ មកយឺត ${lateList.length} · ❌ អវត្តមាន ${absentList.length}`
  ];
  if (lateList.length) {
    summaryLines.push('', '<b>មកយឺត</b>', ...lateList.map(item =>
      `• ${tgText(item.member.name)} · ${tgKhTime(item.time)} (${tgKhDuration(item.lateMinutes)})${item.reason || ''}`
    ));
  }
  if (absentList.length) {
    summaryLines.push('', '<b>អវត្តមាន</b>', ...absentList.map(item => `• ${tgText(item.name)}`));
  }
  const summaryMsg = summaryLines.join('\n');

  return {
    summaryMsg,
    stats: {
      total: totalCount,
      present: presentList.length,
      onTime: onTimeList.length,
      late: lateList.length,
      absent: absentList.length,
      incomplete: incompleteList.length
    },
    lateList,
    absentList
  };
}

// 8. API to Send Daily Summary to Telegram
app.post('/api/attendance/send-daily-summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const report = await generateDailySummaryReport();
    const result = await sendTelegramMessage(report.summaryMsg);
    if (result.success) {
      res.json({
        success: true,
        message: 'របាយការណ៍សរុបវត្តមានប្រចាំថ្ងៃ បានផ្ញើទៅ Telegram ដោយជោគជ័យ!',
        stats: report.stats
      });
    } else {
      res.status(400).json({
        error: result.reason || result.error || 'មិនអាចផ្ញើរបាយការណ៍ទៅ Telegram បានទេ។ សូមពិនិត្យមើល Token & Chat ID'
      });
    }
  } catch (err) {
    console.error('Error generating daily summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. Automated Schedule: Vercel Cron calls this route at 20:00 Cambodia time.
// A database claim prevents duplicate reports if the endpoint is invoked more than once.
app.get('/api/cron/daily-summary', async (req, res) => {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authorization = req.get('authorization') || '';
  const isVercelCron = req.get('user-agent') === 'vercel-cron/1.0';

  if (cronSecret) {
    if (authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized cron request' });
    }
  } else if (!isVercelCron) {
    return res.status(401).json({ error: 'Unauthorized cron request' });
  }

  const isSunday = getCambodiaDayOfWeek() === 0;
  const { hour } = getCambodiaHoursAndMinutes();
  const todayDateStr = getCambodiaDateString();

  if (isSunday) {
    return res.json({ success: true, skipped: true, reason: 'Sunday' });
  }
  if (hour < 20) {
    return res.json({ success: true, skipped: true, reason: 'Before 20:00 Cambodia time' });
  }

  const enabled = await getSetting('telegram_enabled');
  const token = await getTelegramToken();
  const chatId = await getSetting('telegram_chat_id');
  if (enabled !== 'true' || !token || !chatId) {
    return res.json({ success: true, skipped: true, reason: 'Telegram disabled or incomplete settings' });
  }

  const claim = await db.run(`
    INSERT INTO settings (key, value) VALUES ('daily_summary_last_sent', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
    WHERE settings.value <> excluded.value
  `, [todayDateStr]);

  if (claim.changes === 0) {
    return res.json({ success: true, skipped: true, reason: 'Already sent today' });
  }

  try {
    const report = await generateDailySummaryReport();
    const result = await sendTelegramMessage(report.summaryMsg);
    if (!result.success) {
      await db.run("DELETE FROM settings WHERE key = 'daily_summary_last_sent' AND value = ?", [todayDateStr]);
      return res.status(502).json({ error: result.reason || result.error || 'Telegram send failed' });
    }
    console.log(`[CRON] Daily summary sent for ${todayDateStr} at 20:00 Cambodia time.`);
    return res.json({ success: true, sent: true, stats: report.stats });
  } catch (error) {
    await db.run("DELETE FROM settings WHERE key = 'daily_summary_last_sent' AND value = ?", [todayDateStr]);
    console.error('[CRON] Daily summary failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Catch-all for undefined /api routes so it ALWAYS returns JSON and NEVER HTML
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API endpoint '${req.method} ${req.originalUrl}' not found on this server. Please ensure the server has been updated with the latest code.`
  });
});

// Global error handling middleware so Express NEVER returns HTML errors for API routes
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    error: 'Server internal error: ' + (err.message || 'Unknown error')
  });
});

// Start server
if (!process.env.VERCEL) {
  ensureDb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`===============================================`);
      console.log(`🚀 Attendance Web App running at http://localhost:${PORT}`);
      console.log(`📱 Accessible on Local Network via your PC IP Address!`);
      if (process.env.TURSO_DATABASE_URL) {
        console.log(`☁️ Turso Cloud Database Active & Connected!`);
      } else {
        console.log(`💾 Local SQLite file database active.`);
      }
      console.log(`===============================================`);

      // Launch background Telegram Long Polling for interactive buttons
      startTelegramPolling().catch(err => {
        console.error('Failed to run Telegram polling:', err.message);
      });
    });
  }).catch(err => {
    console.error('Failed to start server:', err);
  });
}

module.exports = app;

module.exports = app;
