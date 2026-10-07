const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database
// In serverless environments (like Vercel / AWS Lambda), the deployment root is read-only.
// We copy attendance.db to /tmp where write operations (INSERT/UPDATE) are permitted.
let dbPath = path.join(__dirname, 'attendance.db');
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
  const tmpDbPath = path.join('/tmp', 'attendance.db');
  try {
    if (!fs.existsSync(tmpDbPath) && fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, tmpDbPath);
    }
    dbPath = tmpDbPath;
  } catch (err) {
    console.error('Failed to copy database to /tmp:', err);
  }
}

const db = new DatabaseSync(dbPath);
try {
  db.exec('PRAGMA busy_timeout = 5000;');
} catch (e) {}

// Create tables
db.exec(`
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
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    member_name TEXT,
    member_code TEXT,
    member_role TEXT,
    type TEXT NOT NULL, -- 'check_in' or 'check_out'
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    latitude REAL,
    longitude REAL,
    distance_meters REAL,
    is_within_range INTEGER DEFAULT 1,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed default settings if not exists
const initSettings = [
  ['office_lat', '11.5564'],
  ['office_lng', '104.9282'],
  ['allowed_radius', '150'], // meters
  ['telegram_token', ''],
  ['telegram_chat_id', ''],
  ['telegram_enabled', 'true'],
  ['office_qr_token', 'OFFICE-ATTENDANCE-HQ-2026'],
  ['company_name', 'ស្ថាប័ន / ក្រុមហ៊ុនយើង'],
  ['admin_pin', '1234']
];

const checkSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const insertSettingStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

for (const [k, v] of initSettings) {
  const row = checkSettingStmt.get(k);
  if (!row) {
    insertSettingStmt.run(k, v);
  }
}

// Ensure avatar column exists in members table
try {
  db.exec("ALTER TABLE members ADD COLUMN avatar TEXT");
} catch (e) {
  // column already exists
}

// Seed sample members if empty
const countMembers = db.prepare('SELECT COUNT(*) as count FROM members').get();
if (countMembers.count === 0) {
  const seedMember = db.prepare('INSERT INTO members (code, name, role, phone) VALUES (?, ?, ?, ?)');
  seedMember.run('MEM-001', 'សុក វិបុល (Sok Vibol)', 'Project Manager', '012 345 678');
  seedMember.run('MEM-002', 'ជា ស្រីនាង (Chea Sreynang)', 'UI/UX Designer', '098 765 432');
  seedMember.run('MEM-003', 'ហេង ដារ៉ា (Heng Dara)', 'Developer', '015 112 233');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
function getCambodiaDate() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }));
}

function getCambodiaDateString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date());
}

function formatCambodiaTime(dateObj = new Date()) {
  return dateObj.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Phnom_Penh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function formatCambodiaDate(dateObj = new Date()) {
  return dateObj.toLocaleDateString('km-KH', {
    timeZone: 'Asia/Phnom_Penh',
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Helper: Get setting
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Helper: Send Telegram notification
async function sendTelegramMessage(text) {
  const token = getSetting('telegram_token');
  const chatId = getSetting('telegram_chat_id');
  const enabled = getSetting('telegram_enabled');

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

// ================= API ROUTES =================

// Public Info (for staff mobile app)
app.get('/api/public-info', (req, res) => {
  const members = db.prepare("SELECT code, name, role, avatar FROM members WHERE status = 'active' ORDER BY name ASC").all();
  res.json({
    companyName: getSetting('company_name') || 'ស្ថាប័ន / ក្រុមហ៊ុនយើង',
    officeLat: parseFloat(getSetting('office_lat')),
    officeLng: parseFloat(getSetting('office_lng')),
    allowedRadius: parseFloat(getSetting('allowed_radius')) || 150,
    officeQrToken: getSetting('office_qr_token') || 'OFFICE-ATTENDANCE-HQ-2026',
    members: members
  });
});

// Admin verify PIN
app.post('/api/admin/verify-pin', (req, res) => {
  const { pin } = req.body;
  const currentPin = getSetting('admin_pin') || '1234';
  if (pin === currentPin) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'លេខកូដសម្ងាត់ PIN មិនត្រឹមត្រូវទេ!' });
  }
});

// 1. Dashboard summary (Admin)
app.get('/api/dashboard', (req, res) => {
  const totalMembers = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'active'").get().count;
  
  const todayCheckIns = db.prepare(`
    SELECT COUNT(DISTINCT member_id) as count 
    FROM attendance 
    WHERE type = 'check_in' AND date(timestamp, 'localtime') = date('now', 'localtime')
  `).get().count;

  const todayCheckOuts = db.prepare(`
    SELECT COUNT(DISTINCT member_id) as count 
    FROM attendance 
    WHERE type = 'check_out' AND date(timestamp, 'localtime') = date('now', 'localtime')
  `).get().count;

  const recent = db.prepare(`
    SELECT * FROM attendance 
    ORDER BY timestamp DESC 
    LIMIT 10
  `).all();

  res.json({
    totalMembers,
    todayCheckIns,
    todayCheckOuts,
    absentCount: Math.max(0, totalMembers - todayCheckIns),
    recentLogs: recent,
    officeQrToken: getSetting('office_qr_token') || 'OFFICE-ATTENDANCE-HQ-2026',
    companyName: getSetting('company_name') || 'ស្ថាប័ន / ក្រុមហ៊ុនយើង'
  });
});

// 2. Members Management (Admin)
app.get('/api/members', (req, res) => {
  const members = db.prepare('SELECT * FROM members ORDER BY id DESC').all();
  res.json(members);
});

app.post('/api/members', (req, res) => {
  const { 
    code, name, role, phone, password, 
    gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar 
  } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Code and Name are required' });
  }

  const memberPassword = (password && password.trim()) ? password.trim() : '1234';

  try {
    const stmt = db.prepare(`
      INSERT INTO members (
        code, name, role, phone, password,
        gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
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
    );
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'លេខកូដសមាជិក (Member Code) នេះមានរួចហើយ!' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update Member (Admin)
app.put('/api/members/:id', (req, res) => {
  const { 
    code, name, role, phone, password, 
    gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar 
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const currentMember = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    if (!currentMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const memberPassword = (password && password.trim()) ? password.trim() : (currentMember.password || '1234');
    const memberCode = (code && code.trim()) ? code.trim().toUpperCase() : currentMember.code;
    const memberAvatar = (avatar !== undefined) ? avatar : (currentMember.avatar || '');

    const stmt = db.prepare(`
      UPDATE members SET
        code = ?, name = ?, role = ?, phone = ?, password = ?,
        gender = ?, dob = ?, national_id = ?, email = ?, address = ?, join_date = ?, emergency_contact = ?, salary_type = ?, notes = ?, avatar = ?
      WHERE id = ?
    `);

    stmt.run(
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
    );

    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'លេខកូដសមាជិក (Member Code) នេះមានរួចហើយ!' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/:id', (req, res) => {
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Employee Login (By Member Code / Selection + Password set by Admin)
app.post('/api/members/login', (req, res) => {
  const { code, password } = req.body;
  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'សូមជ្រើសរើសឈ្មោះបុគ្គលិក ឬបញ្ចូលលេខកូដ ID' });
  }

  const member = db.prepare('SELECT * FROM members WHERE code = ? COLLATE NOCASE OR phone = ? COLLATE NOCASE').get(code.trim(), code.trim());
  if (!member) {
    return res.status(404).json({ error: `រកមិនឃើញគណនីដែលមានកូដ "${code}" ទេ! សូមទាក់ទង Admin ដើម្បីចុះឈ្មោះ។` });
  }

  // Password verification: Admin sets this when adding/registering member
  const inputPwd = (password || '').trim();
  const actualPwd = (member.password || '1234').trim();

  if (!inputPwd) {
    return res.status(400).json({ error: 'សូមបញ្ចូលលេខកូដសម្ងាត់ Password ដែល Admin បានកំណត់ជូន!' });
  }

  if (inputPwd !== actualPwd) {
    return res.status(401).json({ error: 'លេខកូដសម្ងាត់ Password មិនត្រឹមត្រូវទេ! សូមទាក់ទង Admin បើអ្នកភ្លេច។' });
  }

  // Return safe member object (without exposing password)
  const safeMember = { ...member };
  delete safeMember.password;
  res.json({ success: true, member: safeMember });
});

// 3. Employee Self-Check-in (Staff scans Office QR code from their mobile phone)
app.post('/api/attendance/check', async (req, res) => {
  try {
    const { code, type, qr_token, latitude, longitude, note } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'សូមបញ្ជាក់លេខកូដសមាជិក (Member Code)' });
    }

    // Verify Office QR token if provided
    const expectedToken = getSetting('office_qr_token') || 'OFFICE-ATTENDANCE-HQ-2026';
    if (qr_token && qr_token.trim() !== expectedToken.trim()) {
      return res.status(400).json({ error: 'QR Code មិនត្រឹមត្រូវទេ! សូមស្កេន QR Code ការិយាល័យផ្លូវការ។' });
    }

    const member = db.prepare('SELECT * FROM members WHERE code = ? COLLATE NOCASE').get(code.trim());
    if (!member) {
      return res.status(404).json({ error: `រកមិនឃើញសមាជិកដែលមានកូដ "${code}" ទេ!` });
    }

    // Normalize action type (4 scans per day: morning_in, lunch_out, afternoon_in, evening_out)
    // Strict max 4 scans check per day (Cambodia time)
    const todayExisting = db.prepare(`
      SELECT * FROM attendance 
      WHERE member_id = ? AND date(timestamp, '+7 hours') = date('now', '+7 hours')
      ORDER BY timestamp ASC
    `).all(member.id);

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
    const officeLat = parseFloat(getSetting('office_lat'));
    const officeLng = parseFloat(getSetting('office_lng'));
    const allowedRadius = parseFloat(getSetting('allowed_radius')) || 150;

    let distance = null;
    let isWithinRange = 1;

    if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null && !isNaN(officeLat) && !isNaN(officeLng)) {
      distance = calculateDistance(latitude, longitude, officeLat, officeLng);
      if (distance !== null && distance > allowedRadius) {
        isWithinRange = 0;
        return res.status(400).json({
          error: `អ្នកនៅក្រៅបរិវេណការិយាល័យ (${distance} ម៉ែត្រ)! ប្រព័ន្ធអនុញ្ញាតត្រឹមតែ ${allowedRadius} ម៉ែត្រប៉ុណ្ណោះ។ សូមចូលទៅក្នុងបរិវេណការិយាល័យដើម្បីស្កេនវត្តមាន។`,
          distance: distance,
          allowedRadius: allowedRadius
        });
      }
    } else if (!isNaN(officeLat) && !isNaN(officeLng) && officeLat !== 0 && officeLng !== 0) {
      // If office location is configured but user did not provide GPS
      return res.status(400).json({
        error: 'សូមបើក Location (GPS Permission) លើទូរស័ព្ទរបស់អ្នក ដើម្បីផ្ទៀងផ្ទាត់ចម្ងាយការិយាល័យមុនពេលស្កេន!'
      });
    }

    // Calculate Cambodia Time (UTC+7) & Punctual / Late / Early departure status
    const cambodiaNow = getCambodiaDate();
    const hours = cambodiaNow.getHours();
    const minutes = cambodiaNow.getMinutes();
    const totalMinutes = hours * 60 + minutes;

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
        statusText = `🔴⚠️ <b>ស្ថានភាព:</b> មកយឺត (${diffMinutes} នាទី)`;
      } else if (totalMinutes <= 480) {
        const earlyMins = 480 - totalMinutes;
        statusText = earlyMins > 0 
          ? `🟢✨ <b>ស្ថានភាព:</b> មកទាន់ពេល (មកមុន ${earlyMins} នាទី)` 
          : `🟢✨ <b>ស្ថានភាព:</b> មកទាន់ពេលវេលា (On-Time)`;
      } else {
        statusText = `🟢✨ <b>ស្ថានភាព:</b> មកទាន់ពេលវេលា (ក្នុងអនុគ្រោះ 10 នាទី)`;
      }
    } else if (actionType === 'lunch_out') {
      if (totalMinutes < 650) { // Before 10:50
        isEarlyLeave = true;
        diffMinutes = 660 - totalMinutes;
        statusText = `🟠🏃💨 <b>ស្ថានភាព:</b> ចេញមុនម៉ោង (${diffMinutes} នាទី)`;
      } else {
        statusText = `🟢🍱 <b>ស្ថានភាព:</b> ចេញសម្រាកបាយតាមកាលវិភាគ`;
      }
    } else if (actionType === 'afternoon_in') {
      if (totalMinutes > 790) { // After 13:10
        isLate = true;
        diffMinutes = totalMinutes - 780;
        statusText = `🔴⚠️ <b>ស្ថានភាព:</b> មកយឺត (${diffMinutes} នាទី)`;
      } else if (totalMinutes <= 780) {
        const earlyMins = 780 - totalMinutes;
        statusText = earlyMins > 0 
          ? `🟢✨ <b>ស្ថានភាព:</b> ចូលទាន់ពេល (មុន ${earlyMins} នាទី)` 
          : `🟢✨ <b>ស្ថានភាព:</b> ចូលទាន់ពេលវេលា (On-Time)`;
      } else {
        statusText = `🟢✨ <b>ស្ថានភាព:</b> ចូលទាន់ពេលវេលា (ក្នុងអនុគ្រោះ 10 នាទី)`;
      }
    } else if (actionType === 'evening_out') {
      if (totalMinutes < 1010) { // Before 16:50
        isEarlyLeave = true;
        diffMinutes = 1020 - totalMinutes;
        statusText = `🟠🏃💨 <b>ស្ថានភាព:</b> ចេញមុនម៉ោង (${diffMinutes} នាទី)`;
      } else {
        statusText = `🟢🏠 <b>ស្ថានភាព:</b> ចេញធ្វើការតាមកាលវិភាគ`;
      }
    }

    // Require reason if late or early leave
    const trimmedNote = (note || '').trim();
    if ((isLate || isEarlyLeave) && !trimmedNote) {
      return res.status(400).json({
        error: isLate 
          ? `អ្នកមកយឺត ${diffMinutes} នាទី! សូមបញ្ជាក់មូលហេតុដែលអ្នកមកយឺត។` 
          : `អ្នកចេញមុនម៉ោង ${diffMinutes} នាទី! សូមបញ្ជាក់មូលហេតុដែលអ្នកចេញមុនម៉ោង។`,
        requiresReason: true,
        reasonType: isLate ? 'late' : 'early',
        diffMinutes: diffMinutes,
        actionType
      });
    }

    // Record attendance
    const insertStmt = db.prepare(`
      INSERT INTO attendance (
        member_id, member_name, member_code, member_role,
        type, latitude, longitude, distance_meters, is_within_range, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const recordResult = insertStmt.run(
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
    );

    const todayScansCount = todayExisting.length + 1;
    const timeStr = formatCambodiaTime(cambodiaNow);
    const dateStr = formatCambodiaDate(cambodiaNow);
    const isSunday = cambodiaNow.getDay() === 0;

    const slotMeta = {
      morning_in: { labelKm: 'ព្រឹកចូលធ្វើការ (08:00)', labelEn: 'Morning Check-In', num: '1/4', badge: '🌅' },
      lunch_out: { labelKm: 'ចេញសម្រាកបាយ (11:00)', labelEn: 'Lunch Break Out', num: '2/4', badge: '🍱' },
      afternoon_in: { labelKm: 'រសៀលចូលធ្វើការវិញ (13:00)', labelEn: 'Afternoon Return In', num: '3/4', badge: '☕' },
      evening_out: { labelKm: 'ល្ងាចចេញធ្វើការ (17:00)', labelEn: 'Evening Check-Out', num: '4/4', badge: '🏠' }
    };

    const meta = slotMeta[actionType] || { labelKm: actionType, labelEn: actionType, num: `${todayScansCount}/4`, badge: '📌' };
    const typeLabel = `${meta.badge} ${meta.labelKm} [${meta.num}]`;

    const companyName = getSetting('company_name') || 'VANN SITHA TRADING CO.,LTD';
    const reasonLine = trimmedNote ? `\n📝 <b>មូលហេតុ:</b> ${trimmedNote}` : '';

    // Build Telegram Notification Message with Emojis
    const telegramMsg = `
🏢 <b>${companyName}</b>
━━━━━━━━━━━━━━
👤 <b>បុគ្គលិក:</b> ${member.name}
💼 <b>តួនាទី:</b> ${member.role || 'ទូទៅ'}
⏰ <b>វេនស្កេន:</b> ${meta.badge} ${meta.labelKm}
🕒 <b>ម៉ោងស្កេន:</b> ${timeStr}
${statusText}${reasonLine}
📅 <b>កាលបរិច្ឆេទ:</b> ${dateStr}
━━━━━━━━━━━━━━
📊 <b>ស្កេនបាន ${todayScansCount}/4 ដងសម្រាប់ថ្ងៃនេះ</b>
    `.trim();

    // Send asynchronous Telegram alert
    sendTelegramMessage(telegramMsg).catch(err => console.error(err));

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
      timestamp: cambodiaNow.toISOString(),
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
app.get('/api/attendance/today-summary', (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }

  const member = db.prepare('SELECT * FROM members WHERE code = ? COLLATE NOCASE').get(code.trim());
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const todayLogs = db.prepare(`
    SELECT * FROM attendance 
    WHERE member_id = ? AND date(timestamp, '+7 hours') = date('now', '+7 hours')
    ORDER BY timestamp ASC
  `).all(member.id);

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

  const cambodiaNow = getCambodiaDate();
  const dayOfWeek = cambodiaNow.getDay(); // 0 is Sunday
  const isSunday = dayOfWeek === 0;

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

// 4. Attendance History (Admin)
app.get('/api/attendance', (req, res) => {
  const { date, member_id, code, limit = 50 } = req.query;
  let query = 'SELECT * FROM attendance WHERE 1=1';
  const params = [];

  if (date) {
    query += " AND date(timestamp, 'localtime') = ?";
    params.push(date);
  }
  if (member_id) {
    query += ' AND member_id = ?';
    params.push(member_id);
  }
  if (code) {
    query += ' AND member_code = ? COLLATE NOCASE';
    params.push(code);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(parseInt(limit));

  const records = db.prepare(query).all(...params);
  res.json(records);
});

// 5. Settings (Admin)
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settingsObj = {};
  for (const r of rows) {
    settingsObj[r.key] = r.value;
  }
  if (settingsObj.telegram_token) {
    const t = settingsObj.telegram_token;
    settingsObj.telegram_token_masked = t.length > 8 ? t.slice(0, 4) + '...' + t.slice(-4) : '******';
  }
  res.json(settingsObj);
});

app.post('/api/settings', (req, res) => {
  const { 
    office_lat, office_lng, allowed_radius, 
    telegram_token, telegram_chat_id, telegram_enabled,
    office_qr_token, company_name, admin_pin 
  } = req.body;
  const updateStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  if (office_lat !== undefined) updateStmt.run('office_lat', String(office_lat));
  if (office_lng !== undefined) updateStmt.run('office_lng', String(office_lng));
  if (allowed_radius !== undefined) updateStmt.run('allowed_radius', String(allowed_radius));
  if (telegram_token !== undefined && telegram_token !== '') updateStmt.run('telegram_token', String(telegram_token));
  if (telegram_chat_id !== undefined) updateStmt.run('telegram_chat_id', String(telegram_chat_id));
  if (telegram_enabled !== undefined) updateStmt.run('telegram_enabled', String(telegram_enabled));
  if (office_qr_token !== undefined) updateStmt.run('office_qr_token', String(office_qr_token));
  if (company_name !== undefined) updateStmt.run('company_name', String(company_name));
  if (admin_pin !== undefined) updateStmt.run('admin_pin', String(admin_pin));

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

// 7. Daily Evening Summary Report (Calculation & Formatting)
function generateDailySummaryReport() {
  const companyName = getSetting('company_name') || 'VANN SITHA TRADING CO., LTD';
  const cambodiaNow = getCambodiaDate();
  const dateStr = formatCambodiaDate(cambodiaNow);
  const timeStr = formatCambodiaTime(cambodiaNow);

  // Get all active members
  const activeMembers = db.prepare("SELECT * FROM members WHERE status = 'active' ORDER BY name ASC").all();
  const totalCount = activeMembers.length;

  // Get all attendance logs for today (Cambodia date)
  const todayLogs = db.prepare(`
    SELECT * FROM attendance 
    WHERE date(timestamp, '+7 hours') = date('now', '+7 hours')
    ORDER BY timestamp ASC
  `).all();

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
        const logDate = new Date(morningLog.timestamp);
        const timeFormat = formatCambodiaTime(logDate);
        const cambodiaLogDate = new Date(logDate.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }));
        const h = cambodiaLogDate.getHours();
        const m = cambodiaLogDate.getMinutes();

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
      `${idx + 1}. ${item.member.name}\n   └ ⏰ មកដល់: ${item.time} (យឺត ${item.lateMinutes} នាទី | ស្កេន ${item.scansCount}/4)${item.reason || ''}`
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
    const report = generateDailySummaryReport();
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
setInterval(() => {
  const cambodiaNow = getCambodiaDate();
  const dayOfWeek = cambodiaNow.getDay(); // 0 is Sunday
  if (dayOfWeek === 0) return; // Skip Sunday

  const hours = cambodiaNow.getHours();
  const minutes = cambodiaNow.getMinutes();
  const todayDateStr = getCambodiaDateString();

  // Trigger automatically at 17:30 or later if not yet sent today
  if (hours >= 17 && minutes >= 30 && lastAutoSentDate !== todayDateStr) {
    const enabled = getSetting('telegram_enabled');
    const token = getSetting('telegram_token');
    const chatId = getSetting('telegram_chat_id');

    if (enabled === 'true' && token && chatId) {
      lastAutoSentDate = todayDateStr;
      console.log(`[SCHEDULE] Sending automated evening attendance summary for ${todayDateStr}...`);
      try {
        const report = generateDailySummaryReport();
        sendTelegramMessage(report.summaryMsg)
          .then(res => {
            if (res.success) console.log('[SCHEDULE] Evening summary sent successfully.');
            else console.error('[SCHEDULE] Failed to send evening summary:', res.reason || res.error);
          })
          .catch(e => console.error('[SCHEDULE] Error sending evening summary:', e));
      } catch (e) {
        console.error('[SCHEDULE] Exception while generating summary:', e);
      }
    }
  }
}, 60000); // Check every 60 seconds

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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(`🚀 Attendance Web App running at http://localhost:${PORT}`);
    console.log(`📱 Accessible on Local Network via your PC IP Address!`);
    console.log(`===============================================`);
  });
}

module.exports = app;

