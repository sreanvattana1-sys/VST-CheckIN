process.env.TZ = 'Asia/Phnom_Penh';
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;

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

  try {
    await db.execute("ALTER TABLE members ADD COLUMN device_id TEXT");
  } catch (e) {
    // Column already exists
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
    ['telegram_token', '8879591305:AAFICQRiKd-ryiJ-e66CZpEPBi4PxoNuc-s'],
    ['telegram_chat_id', '-5037746251'],
    ['telegram_enabled', 'true'],
    ['telegram_leave_chat_id', '-5352852483'],
    ['telegram_leave_enabled', 'true'],
    ['office_qr_token', 'OFFICE-ATTENDANCE-HQ-2026'],
    ['company_name', 'VANN SITHA TRADING CO.,LTD'],
    ['admin_pin', '1234'],
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
}

let dbInitPromise = null;
function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = initDb();
  }
  return dbInitPromise;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

// Helper: Send Telegram notification
async function sendTelegramMessage(text) {
  const token = await getSetting('telegram_token');
  const chatId = await getSetting('telegram_chat_id');
  const enabled = await getSetting('telegram_enabled');

  if (enabled !== 'true' || !token || !chatId) {
    return { success: false, reason: 'Telegram is not configured or disabled' };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    const result = await res.json();
    return { success: result.ok, data: result };
  } catch (err) {
    console.error('Failed to send Telegram message:', err.message);
    return { success: false, error: err.message };
  }
}

// Helper: Send Telegram notification to dedicated Leave / Late Permissions Group
async function sendTelegramLeaveMessage(text, replyMarkup = null) {
  const token = await getSetting('telegram_token');
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
      body: JSON.stringify(body)
    });
    const result = await res.json();
    return { success: result.ok, data: result };
  } catch (err) {
    console.error('Failed to send Telegram leave message:', err.message);
    return { success: false, error: err.message };
  }
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

    await ensureDb();
    const existing = await db.get("SELECT * FROM leave_requests WHERE id = ?", [requestId]);
    if (!existing) {
      await answerTelegramCallback(token, cq.id, '❌ រកមិនឃើញសំណើនេះក្នុងប្រព័ន្ធទេ!', true);
      return;
    }

    const from = cq.from || {};
    const leaderName = [from.first_name, from.last_name].filter(Boolean).join(' ') || (from.username ? '@' + from.username : 'មេដឹកនាំ (Leader)');

    // If already processed
    if (existing.status !== 'pending') {
      const statusLabel = existing.status === 'approved' ? 'បានយល់ព្រម (OK)' : 'បានបដិសេធ';
      await answerTelegramCallback(token, cq.id, `⚠️ សំណើនេះត្រូវបាន${statusLabel}រួចរាល់ហើយ ដោយ៖ ${existing.reviewed_by || 'Admin'}!`, true);
      if (cq.message && cq.message.chat) {
        await removeTelegramInlineButtons(token, cq.message.chat.id, cq.message.message_id);
      }
      return;
    }

    const isApprove = action === 'leave_approve';
    const newStatus = isApprove ? 'approved' : 'rejected';
    const adminResponse = isApprove ? 'Okay! បានយល់ព្រម (អនុញ្ញាតតាម Telegram)' : 'មិនអនុញ្ញាត (បដិសេធតាម Telegram)';

    // 1. Update SQLite DB
    await db.run(`
      UPDATE leave_requests 
      SET status = ?, admin_response = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newStatus, adminResponse, leaderName, requestId]);

    // 2. Answer callback query popup in Telegram
    await answerTelegramCallback(
      token, 
      cq.id, 
      isApprove 
        ? `✅ ជោគជ័យ! លោកអ្នកបាន «យល់ព្រម (OK)» លើសំណើរបស់ ${existing.member_name}។` 
        : `❌ លោកអ្នកបាន «បដិសេធ» លើសំណើរបស់ ${existing.member_name}។`,
      true
    );

    const statusEmoji = isApprove ? '✅' : '❌';
    const statusLabel = isApprove ? 'បានយល់ព្រម (APPROVED - OK)' : 'មិនអនុម័ត (REJECTED)';
    const reqTypeLabel = existing.request_type === 'leave' ? '🏖️ សុំច្បាប់ឈប់សម្រាក' : '🛵 សុំមកយឺត (មានបញ្ហាតាមផ្លូវ)';

    let dateInfo = '';
    if (existing.request_type === 'leave') {
      dateInfo = `${existing.date_start} ${existing.date_end && existing.date_end !== existing.date_start ? 'ដល់ ' + existing.date_end : ''} (${existing.duration_text || '1 ថ្ងៃ'})`;
    } else {
      dateInfo = `ថ្ងៃ ${existing.date_start} • ⏰ មកដល់: ${existing.time_expected || '--'}`;
    }

    // 3. BROADCAST TO OLD / MAIN GROUP (-5037746251) AS EXPLICITLY REQUESTED!
    const decisionOldGroupMsg = `
📢 <b>ការសម្រេចលើសំណើសុំច្បាប់ & មកយឺត</b>
━━━━━━━━━━━━━━━━━
👤 <b>បុគ្គលិក:</b> ${existing.member_name} (<code>${existing.member_code}</code>)
💼 <b>តួនាទី:</b> ${existing.member_role || 'បុគ្គលិក'}
📑 <b>ប្រភេទ:</b> ${reqTypeLabel} (${existing.sub_type || 'ទូទៅ'})
📅 <b>កាលបរិច្ឆេទ:</b> ${dateInfo}
📝 <b>មូលហេតុ:</b> ${existing.reason}
━━━━━━━━━━━━━━━━━
📊 <b>ការសម្រេច:</b> ${statusEmoji} <b>${statusLabel}</b>
💬 <b>សារឆ្លើយតប:</b> "${adminResponse}"
👨‍💼 <b>អនុញ្ញាត/ពិនិត្យដោយ:</b> ${leaderName}
🕒 <b>កាលបរិច្ឆេទ:</b> ${formatCambodiaDate(new Date())} ${formatCambodiaTime(new Date())}
━━━━━━━━━━━━━━━━━
<i>ប្រព័ន្ធវត្តមានឆ្លាតវៃ VANN SITHA TRADING</i>
    `.trim();

    sendTelegramMessage(decisionOldGroupMsg).catch(err => console.error('Error sending decision to old group:', err));

    // 4. UPDATE THE MESSAGE IN THE NEW GROUP (-5352852483): REMOVE BUTTONS & SHOW DECISION
    if (cq.message && cq.message.chat) {
      try {
        const origText = cq.message.text || '';
        const updatedNewGroupText = origText + `\n\n━━━━━━━━━━━━━━━━━\n${statusEmoji} <b>${statusLabel}</b>\n👨‍💼 <b>ពិនិត្យដោយ:</b> ${leaderName}\n🕒 <b>ម៉ោង:</b> ${formatCambodiaTime(new Date())}`;
        
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            text: updatedNewGroupText,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }
          })
        });
      } catch (editErr) {
        console.error('Failed to edit original Telegram message:', editErr.message);
        removeTelegramInlineButtons(token, cq.message.chat.id, cq.message.message_id);
      }
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
      const token = await getSetting('telegram_token');
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

// ================= API ROUTES =================

// Public Info (for staff mobile app)
app.get('/api/public-info', async (req, res) => {
  try {
    const members = await db.all("SELECT id, code, name, role, avatar FROM members WHERE status = 'active' ORDER BY name ASC");
    const companyName = await getSetting('company_name');
    const officeLat = await getSetting('office_lat');
    const officeLng = await getSetting('office_lng');
    const allowedRadius = await getSetting('allowed_radius');
    const officeQrToken = await getSetting('office_qr_token');
    const wifiCheckEnabled = (await getSetting('wifi_check_enabled')) !== 'false';
    const companyWifiIps = (await getSetting('company_wifi_ips')) || '45.119.135.171, 36.37.169.199';

    res.json({
      companyName: companyName || 'VANN SITHA TRADING CO.,LTD',
      officeLat: parseFloat(officeLat),
      officeLng: parseFloat(officeLng),
      allowedRadius: parseFloat(allowedRadius) || 200,
      officeQrToken: officeQrToken || 'OFFICE-ATTENDANCE-HQ-2026',
      wifiCheckEnabled,
      companyWifiIps,
      members: members
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
      allowedIps
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin verify PIN
app.post('/api/admin/verify-pin', async (req, res) => {
  const { pin } = req.body;
  const currentPin = (await getSetting('admin_pin')) || '1234';
  if (pin === currentPin) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'លេខកូដសម្ងាត់ PIN មិនត្រឹមត្រូវទេ!' });
  }
});

// 1. Dashboard summary (Admin)
app.get('/api/dashboard', async (req, res) => {
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

// 2. Members Management (Admin)
app.get('/api/members', async (req, res) => {
  try {
    const members = await db.all("SELECT * FROM members WHERE status != 'pending' OR status IS NULL ORDER BY id DESC");
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members', async (req, res) => {
  const { 
    code, name, role, phone, password, 
    gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar 
  } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Code and Name are required' });
  }

  const memberPassword = (password && password.trim()) ? password.trim() : '1234';

  try {
    const info = await db.run(`
      INSERT INTO members (
        code, name, role, phone, password,
        gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      code.trim().toUpperCase(), 
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

app.put('/api/members/:id', async (req, res) => {
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

    const memberPassword = (password && password.trim()) ? password.trim() : (currentMember.password || '1234');
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

    res.json({ success: true });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'លេខកូដសមាជិក (Member Code) នេះមានរួចហើយ!' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Staff Self-Service: Update profile photo (Name is NOT editable)
app.post('/api/staff/update-avatar', async (req, res) => {
  try {
    const { code, avatar } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Staff code is required' });
    }
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

app.delete('/api/members/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM members WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= STAFF SELF-REGISTRATION & DEVICE BINDING =================

// 1. Staff Self-Registration (starts in 'pending' status for Admin approval)
app.post('/api/members/self-register', async (req, res) => {
  try {
    const { name, phone, role, password, avatar, device_id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'សូមបញ្ចូលឈ្មោះពេញរបស់បុគ្គលិក (Full Name)' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'សូមបញ្ចូលលេខទូរស័ព្ទបុគ្គលិក (Phone Number)' });
    }

    // Check duplicate phone or name
    const cleanPhone = phone.trim().replace(/\s+/g, '');
    const existing = await db.get(
      "SELECT id, code, name, status FROM members WHERE replace(phone, ' ', '') = ? OR name = ? COLLATE NOCASE",
      [cleanPhone, name.trim()]
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
    const memberPwd = (password && password.trim()) ? password.trim() : '1234';

    const insertResult = await db.run(`
      INSERT INTO members (code, name, role, phone, password, avatar, device_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      nextCode,
      name.trim(),
      role ? role.trim() : 'បុគ្គលិក',
      phone.trim(),
      memberPwd,
      avatar || '',
      device_id || null
    ]);

    // Send Instant Alert to Telegram
    const companyName = await getSetting('company_name') || 'VANN SITHA TRADING';
    const tgMsg = `
🔔 <b>ការស្នើសុំចុះឈ្មោះបុគ្គលិកថ្មី (Staff Self-Registration)</b>
🏢 <b>${companyName}</b>
━━━━━━━━━━━━━━━━━
👤 <b>ឈ្មោះបុគ្គលិក:</b> ${name.trim()}
💼 <b>ផ្នែក / តួនាទី:</b> ${role ? role.trim() : 'បុគ្គលិក'}
📱 <b>លេខទូរស័ព្ទ:</b> ${phone.trim()}
🆔 <b>កូដសម្គាល់បណ្តោះអាសន្ន:</b> ${nextCode}
📱 <b>Device Locked:</b> ${device_id ? 'ភ្ជាប់ជាមួយទូរស័ព្ទនេះ (1 Device Only) ✅' : 'មិនទាន់ភ្ជាប់'}
⏳ <b>ស្ថានភាព:</b> រង់ចាំ Admin អនុម័ត (Pending)
━━━━━━━━━━━━━━━━━
👉 <i>សូមចូល Admin Dashboard ដើម្បីត្រួតពិនិត្យ និងចុច «អនុម័ត (Approve)»</i>
    `.trim();

    sendTelegramMessage(tgMsg).catch(err => console.error('Telegram alert failed:', err));

    res.json({
      success: true,
      member: {
        id: insertResult.lastInsertRowid,
        code: nextCode,
        name: name.trim(),
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
app.get('/api/members/pending', async (req, res) => {
  try {
    const list = await db.all("SELECT id, code, name, role, phone, avatar, device_id, created_at FROM members WHERE status = 'pending' ORDER BY id DESC");
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Admin: Approve pending member
app.post('/api/members/:id/approve', async (req, res) => {
  try {
    const member = await db.get("SELECT * FROM members WHERE id = ? AND status = 'pending'", [req.params.id]);
    if (!member) {
      return res.status(404).json({ error: 'រកមិនឃើញការស្នើសុំសមាជិកនេះទេ' });
    }

    await db.run("UPDATE members SET status = 'active' WHERE id = ?", [req.params.id]);

    // Send Telegram broadcast
    const companyName = await getSetting('company_name') || 'VANN SITHA TRADING';
    const tgMsg = `
✅ <b>អនុម័តបុគ្គលិកថ្មីជោគជ័យ (Staff Approved)</b>
🏢 <b>${companyName}</b>
━━━━━━━━━━━━━━━━━
👤 <b>ឈ្មោះបុគ្គលិក:</b> ${member.name}
🆔 <b>កូដសម្គាល់ផ្លូវការ:</b> ${member.code}
💼 <b>ផ្នែក / តួនាទី:</b> ${member.role || 'បុគ្គលិក'}
📱 <b>Device:</b> 1 Device Locked ✅
🎉 <i>បុគ្គលិកបានក្លាយជាសមាជិកផ្លូវការ និងអាចចូលកត់ត្រាវត្តមានបានចាប់ពីពេលនេះតទៅ!</i>
    `.trim();
    sendTelegramMessage(tgMsg).catch(err => console.error('Telegram approval alert failed:', err));

    res.json({ success: true, message: `បានអនុម័តសមាជិក ${member.name} (${member.code}) ដោយជោគជ័យ!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Admin: Reject pending member
app.post('/api/members/:id/reject', async (req, res) => {
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
app.post('/api/members/:id/reset-device', async (req, res) => {
  try {
    const member = await db.get("SELECT id, name, code FROM members WHERE id = ?", [req.params.id]);
    if (!member) {
      return res.status(404).json({ error: 'រកមិនឃើញសមាជិកនេះទេ' });
    }

    await db.run("UPDATE members SET device_id = NULL WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: `បានដោះសោទូរស័ព្ទ (Device Reset) សម្រាប់ ${member.name} រួចរាល់! បុគ្គលិកអាចប្រើទូរស័ព្ទថ្មីបាន។` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Login (By Member Code / Selection + Password set by Admin)
app.post('/api/members/login', async (req, res) => {
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
  const actualPwd = (member.password || '1234').trim();

  if (!inputPwd) {
    return res.status(400).json({ error: 'សូមបញ្ចូលលេខកូដសម្ងាត់ Password!' });
  }

  if (inputPwd !== actualPwd) {
    return res.status(401).json({ error: 'លេខកូដសម្ងាត់ Password មិនត្រឹមត្រូវទេ! សូមទាក់ទង Admin បើអ្នកភ្លេច។' });
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
  res.json({ success: true, member: safeMember });
});

app.post('/api/attendance/check', async (req, res) => {
  try {
    const { code, type, qr_token, latitude, longitude, note, check_method } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'សូមបញ្ជាក់លេខកូដសមាជិក (Member Code)' });
    }

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
    const trimmedNote = (note || '').trim();
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
    const timeStr = formatCambodiaTime(now);
    const dateStr = formatCambodiaDate(now);
    const isSunday = getCambodiaDayOfWeek(now) === 0;

    const slotMeta = {
      morning_in: { labelKm: 'ព្រឹកចូលធ្វើការ (08:00)', labelEn: 'Morning Check-In', num: '1/4', badge: '🌅' },
      lunch_out: { labelKm: 'ចេញសម្រាកបាយ (11:00)', labelEn: 'Lunch Break Out', num: '2/4', badge: '🍱' },
      afternoon_in: { labelKm: 'រសៀលចូលធ្វើការវិញ (13:00)', labelEn: 'Afternoon Return In', num: '3/4', badge: '☕' },
      evening_out: { labelKm: 'ល្ងាចចេញធ្វើការ (17:00)', labelEn: 'Evening Check-Out', num: '4/4', badge: '🏠' }
    };

    const meta = slotMeta[actionType] || { labelKm: actionType, labelEn: actionType, num: `${todayScansCount}/4`, badge: '📌' };
    const typeLabel = `${meta.badge} ${meta.labelKm} [${meta.num}]`;

    const companyName = (await getSetting('company_name')) || 'VANN SITHA TRADING CO.,LTD';
    const reasonLine = trimmedNote ? `\n📝 <b>មូលហេតុ:</b> ${trimmedNote}` : '';
    const methodDesc = isButtonCheck 
      ? `📶 ចុចប៊ូតុង Wi-Fi ក្រុមហ៊ុន (${clientIp})`
      : `📷 ស្កេនកាមេរ៉ា QR Code`;

    // Build Telegram Notification Message with Emojis
    const telegramMsg = `
🏢 <b>${companyName}</b>
━━━━━━━━━━━━━━
👤 <b>បុគ្គលិក:</b> ${member.name}
💼 <b>តួនាទី:</b> ${member.role || 'ទូទៅ'}
⏰ <b>វេនវត្តមាន:</b> ${meta.badge} ${meta.labelKm}
🕒 <b>ម៉ោងកត់ត្រា:</b> ${timeStr}
📱 <b>វិធី:</b> ${methodDesc}
${statusText}${reasonLine}
📅 <b>កាលបរិច្ឆេទ:</b> ${dateStr}
━━━━━━━━━━━━━━
📊 <b>កត់ត្រាបាន ${todayScansCount}/4 ដងសម្រាប់ថ្ងៃនេះ</b>
    `.trim();

    sendTelegramMessage(telegramMsg).catch(err => {
      console.error('Background Telegram send error:', err);
    });

    res.json({
      success: true,
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
app.get('/api/attendance/today-summary', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }

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
app.get('/api/attendance', async (req, res) => {
  try {
    const { date, startDate, endDate, month, member_id, code, limit = 500 } = req.query;
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
app.get('/api/settings', async (req, res) => {
  const rows = await db.all('SELECT * FROM settings');
  const settingsObj = {};
  for (const r of rows) {
    settingsObj[r.key] = r.value;
  }
  res.json(settingsObj);
});

app.post('/api/settings', async (req, res) => {
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
  if (telegram_token !== undefined && telegram_token !== '') await saveSetting('telegram_token', telegram_token);
  await saveSetting('telegram_chat_id', telegram_chat_id);
  await saveSetting('telegram_enabled', telegram_enabled);
  await saveSetting('telegram_leave_chat_id', telegram_leave_chat_id);
  await saveSetting('telegram_leave_enabled', telegram_leave_enabled);
  await saveSetting('office_qr_token', office_qr_token);
  await saveSetting('company_name', company_name);
  await saveSetting('admin_pin', admin_pin);
  await saveSetting('wifi_check_enabled', wifi_check_enabled);
  await saveSetting('company_wifi_ips', company_wifi_ips);

  res.json({ success: true, message: 'បានរក្សាទុកការកំណត់ជោគជ័យ' });
});

// 6. Test Telegram Connection
app.post('/api/settings/test-telegram', async (req, res) => {
  const testMsg = `
🤖 <b>ការតេស្តសាកល្បង Telegram Bot</b>
━━━━━━━━━━━━━━━━━━
✅ ប្រព័ន្ធវត្តមាន Attendance Web App បានភ្ជាប់ជាមួយ Telegram ដោយជោគជ័យ!
📅 កាលបរិច្ឆេទ: ${new Date().toLocaleString('km-KH')}
━━━━━━━━━━━━━━━━━━
<i>ត្រៀមទទួលការជូនដំណឹងពេលបុគ្គលិកស្កេនចូលធ្វើការ...</i>
  `.trim();

  const result = await sendTelegramMessage(testMsg);
  if (result.success) {
    res.json({ success: true, message: 'សារសាកល្បងបានផ្ញើទៅ Telegram រួចរាល់!' });
  } else {
    res.status(400).json({ error: result.reason || result.error || 'មិនអាចផ្ញើសារបានទេ។ សូមពិនិត្យ Token និង Chat ID ឡើងវិញ' });
  }
});

// 6.1 Test Dedicated Telegram Leave Group
app.post('/api/settings/test-telegram-leave', async (req, res) => {
  const testMsg = `
🔔 <b>តេស្តផ្ញើសារ Telegram Group សុំច្បាប់ & មកយឺត</b>
━━━━━━━━━━━━━━━━━━
✅ Group នេះបានភ្ជាប់ជោគជ័យ និងត្រៀមទទួលការជូនដំណឹងពេលបុគ្គលិកស្នើសុំច្បាប់ ឬសុំមកយឺត!
📅 កាលបរិច្ឆេទ: ${formatCambodiaDate(new Date())} ${formatCambodiaTime(new Date())}
━━━━━━━━━━━━━━━━━━
<i>ប្រព័ន្ធគ្រប់គ្រងវត្តមានឆ្លាតវៃ VANN SITHA TRADING</i>
  `.trim();

  const result = await sendTelegramLeaveMessage(testMsg);
  if (result.success) {
    res.json({ success: true, message: 'សារតេស្តបានផ្ញើទៅកាន់ Group សុំច្បាប់ដោយជោគជ័យ!' });
  } else {
    res.status(400).json({ error: result.reason || result.error || 'មិនអាចផ្ញើសារបានទេ។ សូមពិនិត្យមើល Leave Chat ID ឡើងវិញ' });
  }
});

// ================= LEAVE & LATE PERMISSION REQUESTS API =================

// 6.2 Submit Leave or Late Request (Staff Web App)
app.post('/api/leave-requests', async (req, res) => {
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

    let member = await db.get("SELECT * FROM members WHERE code = ? COLLATE NOCASE", [staffCode]);
    if (!member) {
      member = {
        id: req.body.member_id || null,
        name: req.body.member_name || staffCode,
        code: staffCode,
        role: req.body.member_role || 'បុគ្គលិក'
      };
    }

    const cleanReason = reason.trim();
    const reqTypeLabel = request_type === 'leave' ? '🏖️ សុំច្បាប់ឈប់សម្រាក' : '🛵 សុំមកយឺត (មានបញ្ហាតាមផ្លូវ)';
    const cleanDuration = duration_text || (request_type === 'leave' ? '1 ថ្ងៃ' : 'មកយឺត');

    const result = await db.run(`
      INSERT INTO leave_requests (
        member_id, member_name, member_code, member_role,
        request_type, sub_type, date_start, date_end,
        time_expected, duration_text, reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      member.id, member.name, member.code, member.role || 'បុគ្គលិក',
      request_type, sub_type || 'ទូទៅ', date_start, date_end || null,
      time_expected || null, cleanDuration, cleanReason
    ]);

    const requestId = result.lastInsertRowid;

    // Format Telegram Alert for the dedicated Leave Group (-5352852483) with Inline Buttons
    const dateRangeStr = (date_end && date_end !== date_start) ? `${date_start} ដល់ ${date_end}` : date_start;
    const timeExpectedLine = time_expected ? `\n⏰ <b>រំពឹងមកដល់នៅម៉ោង:</b> ${time_expected}` : '';

    const telegramAlert = `
🔔 <b>សំណើ${request_type === 'leave' ? 'សុំច្បាប់ឈប់សម្រាក' : 'សុំមកយឺត'}ថ្មី!</b>
━━━━━━━━━━━━━━━━━
👤 <b>បុគ្គលិក:</b> ${member.name} (<code>${member.code}</code>)
💼 <b>តួនាទី:</b> ${member.role || 'បុគ្គលិក'}
📑 <b>ប្រភេទ:</b> ${reqTypeLabel} (${sub_type || 'ទូទៅ'})
📅 <b>កាលបរិច្ឆេទ:</b> ${dateRangeStr} (${cleanDuration})${timeExpectedLine}
📝 <b>មូលហេតុ:</b> ${cleanReason}
🕒 <b>ម៉ោងស្នើសុំ:</b> ${formatCambodiaDate(new Date())} ${formatCambodiaTime(new Date())}
━━━━━━━━━━━━━━━━━
📊 <b>ស្ថានភាព:</b> ⏳ <b>រង់ចាំការអនុម័ត (PENDING)</b>
<i>👉 មេដឹកនាំ (Leaders) អាចចុចប៊ូតុងខាងក្រោមដើម្បី <b>អនុញ្ញាត</b> ឬ <b>បដិសេធ</b> ភ្លាមៗ</i>
    `.trim();

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ អនុញ្ញាត (Approve - OK)', callback_data: `leave_approve:${requestId}` },
          { text: '❌ បដិសេធ (Reject)', callback_data: `leave_reject:${requestId}` }
        ]
      ]
    };

    sendTelegramLeaveMessage(telegramAlert, inlineKeyboard).then(async (sendRes) => {
      if (sendRes && sendRes.data && sendRes.data.result) {
        const msgId = sendRes.data.result.message_id;
        const chatId = sendRes.data.result.chat.id;
        await db.run("UPDATE leave_requests SET tg_message_id = ?, tg_chat_id = ? WHERE id = ?", [msgId, String(chatId), requestId]);
      }
    }).catch(err => console.error('Telegram leave alert error:', err));

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
app.get('/api/leave-requests', async (req, res) => {
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
app.get('/api/leave-requests/my', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

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
app.post('/api/leave-requests/:id/review', async (req, res) => {
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

    const cleanResponse = (admin_response || (status === 'approved' ? 'Okay! បានយល់ព្រម' : 'មិនអនុម័ត')).trim();
    const reviewer = reviewed_by || 'Admin';

    await db.run(`
      UPDATE leave_requests 
      SET status = ?, admin_response = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, cleanResponse, reviewer, id]);

    // Send decision notification to OLD / MAIN Telegram Group (-5037746251)
    const statusEmoji = status === 'approved' ? '✅' : '❌';
    const statusLabel = status === 'approved' ? 'បានយល់ព្រម (APPROVED - OK)' : 'មិនអនុម័ត (REJECTED)';
    const reqTypeLabel = existing.request_type === 'leave' ? '🏖️ សុំច្បាប់ឈប់សម្រាក' : '🛵 សុំមកយឺត (មានបញ្ហាតាមផ្លូវ)';

    let dateInfo = '';
    if (existing.request_type === 'leave') {
      dateInfo = `${existing.date_start} ${existing.date_end && existing.date_end !== existing.date_start ? 'ដល់ ' + existing.date_end : ''} (${existing.duration_text || '1 ថ្ងៃ'})`;
    } else {
      dateInfo = `ថ្ងៃ ${existing.date_start} • ⏰ មកដល់: ${existing.time_expected || '--'}`;
    }

    const decisionTelegram = `
📢 <b>ការសម្រេចលើសំណើសុំច្បាប់ & មកយឺត</b>
━━━━━━━━━━━━━━━━━
👤 <b>បុគ្គលិក:</b> ${existing.member_name} (<code>${existing.member_code}</code>)
💼 <b>តួនាទី:</b> ${existing.member_role || 'បុគ្គលិក'}
📑 <b>ប្រភេទសំណើ:</b> ${reqTypeLabel} (${existing.sub_type || 'ទូទៅ'})
📅 <b>កាលបរិច្ឆេទ:</b> ${dateInfo}
📝 <b>មូលហេតុ:</b> ${existing.reason}
━━━━━━━━━━━━━━━━━
📊 <b>ការសម្រេច:</b> ${statusEmoji} <b>${statusLabel}</b>
💬 <b>សារពី Admin:</b> "${cleanResponse}"
👨‍💼 <b>ពិនិត្យ/អនុញ្ញាតដោយ:</b> ${reviewer}
🕒 <b>កាលបរិច្ឆេទ:</b> ${formatCambodiaDate(new Date())} ${formatCambodiaTime(new Date())}
━━━━━━━━━━━━━━━━━
<i>ប្រព័ន្ធវត្តមានឆ្លាតវៃ VANN SITHA TRADING</i>
    `.trim();

    // Broadcast to the OLD / MAIN Telegram Group!
    sendTelegramMessage(decisionTelegram).catch(err => console.error('Telegram decision to old group error:', err));

    // Remove buttons and update message in the NEW GROUP if tg_message_id is known
    if (existing.tg_message_id && existing.tg_chat_id) {
      getSetting('telegram_token').then(tok => {
        if (tok) removeTelegramInlineButtons(tok, existing.tg_chat_id, existing.tg_message_id);
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
  const companyName = (await getSetting('company_name')) || 'VANN SITHA TRADING CO., LTD';
  const now = new Date();
  const dateStr = formatCambodiaDate(now);
  const timeStr = formatCambodiaTime(now);
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
        const timeFormat = formatCambodiaTime(morningLog.timestamp);
        const { hour: h, minute: m } = getCambodiaHoursAndMinutes(morningLog.timestamp);

        // Schedule is 08:00 with 10 mins grace (late if > 08:10)
        if (h > 8 || (h === 8 && m > 10)) {
          const lateMinutes = (h - 8) * 60 + m;
          const reasonText = morningLog.note ? ` | 📝 មូលហេតុ: ${morningLog.note}` : '';
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
  let lateSection = '<i>• គ្មានបុគ្គលិកមកយឺតទេ</i>';
  if (lateList.length > 0) {
    lateSection = lateList.map((item, idx) => 
      `${idx + 1}. ${item.member.name}\n   └ ⏰ មកដល់: ${item.time} (យឺត ${formatDurationKm(item.lateMinutes)} | ស្កេន ${item.scansCount}/4)${item.reason || ''}`
    ).join('\n');
  }

  // Format Absentee Text
  let absentSection = '<i>• គ្មានបុគ្គលិកអវត្តមានទេ</i>';
  if (absentList.length > 0) {
    absentSection = absentList.map((item, idx) => 
      `${idx + 1}. ${item.name} - ${item.role || 'ទូទៅ'}`
    ).join('\n');
  }

  // Build Final Report
  const summaryMsg = `
📊 <b>របាយការណ៍សរុបវត្តមានប្រចាំថ្ងៃ (Daily Attendance Summary)</b>
🏢 <b>${companyName}</b>
📅 <b>កាលបរិច្ឆេទ:</b> ${dateStr}
🕒 <b>ម៉ោងរបាយការណ៍:</b> ${timeStr}
━━━━━━━━━━━━━━━━━━
👥 <b>បុគ្គលិកសរុប:</b> ${totalCount} នាក់
✅ <b>មានវត្តមាន:</b> ${presentList.length} នាក់
⏰ <b>មកទាន់ពេល:</b> ${onTimeList.length} នាក់
⚠️ <b>មកយឺត (Late):</b> ${lateList.length} នាក់
❌ <b>អវត្តមាន (Absent):</b> ${absentList.length} នាក់

⚠️ <b>បញ្ជីឈ្មោះបុគ្គលិកមកយឺត (${lateList.length} នាក់):</b>
${lateSection}

❌ <b>បញ្ជីឈ្មោះបុគ្គលិកអវត្តមាន (${absentList.length} នាក់):</b>
${absentSection}
━━━━━━━━━━━━━━━━━
<i>ប្រព័ន្ធវត្តមានស្វ័យប្រវត្តិ VANN SITHA TRADING</i>
  `.trim();

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
app.post('/api/attendance/send-daily-summary', async (req, res) => {
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

// 9. Automated Schedule: Daily evening report at 17:30 (Monday - Saturday)
let lastAutoSentDate = '';
setInterval(async () => {
  const isSunday = getCambodiaDayOfWeek() === 0;
  if (isSunday) return; // Skip Sunday

  const { hour: hours, minute: minutes } = getCambodiaHoursAndMinutes();
  const todayDateStr = getCambodiaDateString();

  // Trigger automatically at 17:30 or later if not yet sent today
  if (hours >= 17 && minutes >= 30 && lastAutoSentDate !== todayDateStr) {
    const enabled = await getSetting('telegram_enabled');
    const token = await getSetting('telegram_token');
    const chatId = await getSetting('telegram_chat_id');

    if (enabled === 'true' && token && chatId) {
      lastAutoSentDate = todayDateStr;
      console.log(`[SCHEDULE] Sending automated evening attendance summary for ${todayDateStr}...`);
      try {
        const report = await generateDailySummaryReport();
        const res = await sendTelegramMessage(report.summaryMsg);
        if (res.success) console.log('[SCHEDULE] Evening summary sent successfully.');
        else console.error('[SCHEDULE] Failed to send evening summary:', res.reason || res.error);
      } catch (e) {
        console.error('[SCHEDULE] Exception while generating summary:', e);
      }
    }
  }
}, 60000); // Check every 60 seconds

// Webhook endpoint (alternative to long polling for serverless/Vercel)
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const token = await getSetting('telegram_token');
    const update = req.body;
    if (update && update.callback_query && token) {
      await handleTelegramCallbackQuery(update.callback_query, token);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.status(500).json({ error: err.message });
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
