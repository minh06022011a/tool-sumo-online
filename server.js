const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const upload = multer({ dest: 'uploads/' });

const SECRET_SESSION = "minh_boss_pro_max_final_v3";

// LOGO RGB
const VIP_LOGO = `
<style>
    @keyframes rainbow-move { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
    .promax-badge { background: linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000); background-size: 200% auto; animation: rainbow-move 3s linear infinite; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-left: 8px; box-shadow: 0 0 10px rgba(255,255,255,0.5); font-weight: 900; text-shadow: 1px 1px 1px black; border: 1px solid rgba(255,255,255,0.3); }
</style>
<a href="/" style="position: fixed; top: 15px; left: 20px; z-index: 99999; text-decoration: none; font-family: sans-serif; font-weight: 900; font-size: 20px; color: white; display: flex; align-items: center; text-shadow: 0 0 10px rgba(0,255,0,0.8); letter-spacing: 1px;">
    <span style="font-size: 26px; margin-right: 5px; color: yellow; filter: drop-shadow(0 0 5px yellow);">⚡</span> CONVERT <span class="promax-badge">PRO MAX</span>
</a>`;

app.set('trust proxy', true); 
app.use(session({ secret: SECRET_SESSION, resave: false, saveUninitialized: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const USER_FILE = path.join(__dirname, 'users.json');
const LOG_FILE = path.join(__dirname, 'logs.json'); 
const USER_LOG_FILE = path.join(__dirname, 'user_logs.json'); 
const KEY_FILE = path.join(__dirname, 'active_keys.json');

function getData(file) { if (!fs.existsSync(file)) fs.writeFileSync(file, '[]'); try { return JSON.parse(fs.readFileSync(file)); } catch { return []; } }
function saveData(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function injectLogo(html) { return html.replace(/(<body[^>]*>)/i, '$1' + VIP_LOGO); }
function renderMessage(res, msg, link) { let tpl = fs.readFileSync(path.join(__dirname, 'message.html'), 'utf-8'); res.send(injectLogo(tpl.replace('REPLACE_MESSAGE', msg).replace('REPLACE_LINK', link))); }

function addUserLog(username, action) {
    let logs = getData(USER_LOG_FILE);
    logs.unshift({ time: new Date().toLocaleString(), user: username, action: action });
    if(logs.length > 100) logs.pop(); saveData(USER_LOG_FILE, logs);
}
function addAdminLog(action, target, detail) {
    let logs = getData(LOG_FILE);
    logs.unshift({ time: new Date().toLocaleString(), action, target, detail });
    if(logs.length > 50) logs.pop(); saveData(LOG_FILE, logs);
}

function generateRandomKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'SUMO-';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    result += '-';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result; 
}

function initOwner() {
    let users = getData(USER_FILE);
    if (!users.find(u => u.username === 'admin')) {
        users.push({ username: "admin", password: "123", role: "owner", banned: false });
        saveData(USER_FILE, users);
    }
}
initOwner();

// MIDDLEWARE
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    const users = getData(USER_FILE);
    const u = users.find(x => x.username === req.session.user.username);
    if (!u) { req.session.destroy(); return res.redirect('/login'); }
    req.session.user = u; next();
}
function requireOwner(req, res, next) { if (req.session.user.role !== 'owner') return renderMessage(res, 'Cút! Chỉ dành cho Owner.', '/tool'); next(); }

function requireVip(req, res, next) {
    const u = req.session.user;
    if (['owner', 'admin', 'mod', 'vip'].includes(u.role)) return next();
    
    let html = fs.readFileSync(path.join(__dirname, 'active_key.html'), 'utf-8');
    html = html.replace('href="/lay-key-tu-dong"', 'href="/lay-key-tu-dong"'); 
    res.send(injectLogo(html));
}

// ROUTER
app.get('/', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'))));
app.get('/login', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'login.html'), 'utf-8'))));
app.get('/register', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'register.html'), 'utf-8'))));

app.post('/register', (req, res) => {
    const { username, password } = req.body; let users = getData(USER_FILE);
    if (users.find(u => u.username === username)) return renderMessage(res, 'Trùng tên!', '/register');
    let role = (username === 'admin') ? 'owner' : 'user';
    users.push({ username, password, role, banned: false }); saveData(USER_FILE, users);
    addUserLog(username, "Đăng ký tài khoản mới");
    renderMessage(res, `Tạo nick ${username} thành công!`, '/login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body; const users = getData(USER_FILE);
    const u = users.find(x => x.username === username && x.password === password);
    if (!u) return renderMessage(res, 'Sai thông tin!', '/login');
    req.session.user = u; 
    addUserLog(username, "Đăng nhập");
    res.redirect('/tool');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// AUTO KEY (NÂNG CẤP CHỐNG VPN BẰNG COOKIE)
app.get('/lay-key-tu-dong', (req, res) => {
    const userIP = req.ip || req.connection.remoteAddress;
    let keys = getData(KEY_FILE);
    const now = Date.now();

    // 1. Kiểm tra Cookie (Con chip theo dõi)
    // Nếu trình duyệt gửi lên header cookie chứa mã key cũ -> Lấy key đó luôn
    let cookieKey = null;
    if (req.headers.cookie) {
        const match = req.headers.cookie.match(/tracking_key=([^;]+)/);
        if (match) cookieKey = match[1];
    }

    // 2. Logic kiểm tra kép: Trùng IP HOẶC Trùng Cookie
    let existingKey = keys.find(k => 
        (k.ip === userIP && k.expires > now) || 
        (cookieKey && k.code === cookieKey && k.expires > now)
    );

    let keyToShow = "";

    if (existingKey) {
        keyToShow = existingKey.code;
        // Gắn lại cookie cho chắc
        res.setHeader('Set-Cookie', `tracking_key=${keyToShow}; Max-Age=86400; Path=/; HttpOnly`);
    } else {
        const newKey = generateRandomKey();
        keys.push({ code: newKey, ip: userIP, created: now, expires: now + 86400000, usedBy: null });
        saveData(KEY_FILE, keys);
        keyToShow = newKey;
        // Gắn con chip (Cookie) vào trình duyệt, sống 24h (86400 giây)
        res.setHeader('Set-Cookie', `tracking_key=${newKey}; Max-Age=86400; Path=/; HttpOnly`);
    }

    let html = fs.readFileSync(path.join(__dirname, 'key_display.html'), 'utf-8');
    html = html.replace('{{GENERATED_KEY}}', keyToShow);
    res.send(html);
});

app.post('/activate-key', requireLogin, (req, res) => {
    const { key } = req.body;
    let keys = getData(KEY_FILE);
    let users = getData(USER_FILE);
    const keyData = keys.find(k => k.code === key.trim());

    if (keyData) {
        if (Date.now() > keyData.expires) return renderMessage(res, 'Key hết hạn!', '/logout');
        
        const uIdx = users.findIndex(u => u.username === req.session.user.username);
        users[uIdx].role = 'vip';
        saveData(USER_FILE, users);

        keyData.usedBy = req.session.user.username;
        saveData(KEY_FILE, keys);

        addUserLog(req.session.user.username, `Kích hoạt KEY: ${keyData.code}`);
        renderMessage(res, `LÊN VIP THÀNH CÔNG!`, '/tool');
    } else {
        addUserLog(req.session.user.username, `Nhập sai Key: ${key}`);
        renderMessage(res, 'Key sai!', '/logout');
    }
});

app.get('/tool', requireLogin, requireVip, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'tool.html'), 'utf-8');
    const u = req.session.user;
    
    // Viết hoa chữ cái đầu cho Role (ví dụ: admin -> Admin)
    const displayRole = u.role.charAt(0).toUpperCase() + u.role.slice(1);

    let adminBtn = (u.role === 'owner') ? '<a href="/owner" style="color:red;font-weight:bold;margin-right:10px;">👑 OWNER PANEL</a>' : '';
    let menu = VIP_LOGO + `<div style="background:#222;padding:10px 10px 10px 180px;color:#0f0;border-bottom:1px solid lime;">Hello <b>${u.username}</b> [${displayRole}] | ${adminBtn} <a href="/logout" style="color:white;">Thoát</a></div>`;
    res.send(html.replace('<body>', '<body>' + menu));
});

app.post('/upload', requireLogin, requireVip, upload.single('video'), (req, res) => {
    if(!req.file) return renderMessage(res, 'Chưa chọn file!', '/tool');
    addUserLog(req.session.user.username, "Upload video");
    const input = req.file.path; const output = path.join(__dirname, `video_${Date.now()}.3gp`);
    const cmd = `"${ffmpegPath}" -i "${input}" -vcodec mpeg4 -acodec libopencore_amrnb -ac 1 -ar 8000 -s 176x144 -r 15 -y "${output}"`;
    exec(cmd, (e) => { if(e) return renderMessage(res, 'Lỗi: ' + e.message, '/tool'); res.download(output, () => fs.unlinkSync(input)); });
});

app.get('/owner', requireLogin, requireOwner, (req, res) => {
    const users = getData(USER_FILE); const keys = getData(KEY_FILE);
    const userLogs = getData(USER_LOG_FILE); const adminLogs = getData(LOG_FILE);
    
    let html = fs.readFileSync(path.join(__dirname, 'owner.html'), 'utf-8');
    
    let keyRows = keys.map(k => `<tr><td style="color:yellow;font-weight:bold;">${k.code}</td><td>${k.ip||'N/A'}</td><td style="color:${Date.now()>k.expires?'red':'lime'}">${Date.now()>k.expires?'Hết':'Còn'}</td><td>${k.usedBy||'-'}</td><td><form action="/owner/delete-key" method="POST"><input type="hidden" name="keyCode" value="${k.code}"><button style="background:red;color:white;border:none;">Xóa</button></form></td></tr>`).join('');
    let ulHtml = userLogs.map(l => `<div class="log-row"><span class="time">[${l.time}]</span> <span class="user">${l.user}</span>: <span class="action">${l.action}</span></div>`).join('');
    let alHtml = adminLogs.map(l => `<div class="log-row"><span class="time">[${l.time}]</span> <b style="color:red">${l.action}</b> ${l.target} (${l.detail})</div>`).join('');
    
    // FIX LỖI ACTION... VÀ VIẾT HOA ROLE Ở ĐÂY
    let uHtml = users.map(u => { 
        if(u.role==='owner') return '';
        
        // Viết hoa Role: vip -> Vip, admin -> Admin
        const displayRole = u.role.charAt(0).toUpperCase() + u.role.slice(1);
        
        // Hiện nút bấm Hành động thay vì chữ Action...
        let actionBtn = !u.banned 
            ? `<form action="/owner/ban" method="POST" style="display:inline"><input type="hidden" name="target" value="${u.username}"><button class="btn-kill">BAN</button></form>` 
            : `<form action="/owner/unban" method="POST" style="display:inline"><input type="hidden" name="target" value="${u.username}"><button class="btn-save">MỞ</button></form>`;

        return `<tr><td>${u.username}</td><td><span style="color:cyan; font-weight:bold;">${displayRole}</span></td><td style="color:${u.banned?'red':'lime'}">${u.banned?'BLOCK':'OK'}</td><td>${actionBtn}</td></tr>`; 
    }).join('');
    
    html = injectLogo(html);
    html = html.replace('{{KEY_COUNT}}', keys.length); html = html.replace('{{KEY_LIST}}', keyRows);
    html = html.replace('{{USER_LOGS}}', ulHtml || 'Chưa có hoạt động'); html = html.replace('{{ADMIN_LOGS}}', alHtml || 'Chưa có trảm'); html = html.replace('{{USER_LIST}}', uHtml);
    res.send(html);
});

app.get('/owner/export-user-logs', requireLogin, requireOwner, (req, res) => {
    const logs = getData(USER_LOG_FILE);
    const content = logs.map(l => `[${l.time}] User: ${l.user} | Action: ${l.action}`).join('\n');
    const filePath = path.join(__dirname, 'UserLogs.txt'); fs.writeFileSync(filePath, content); res.download(filePath);
});
app.get('/owner/export-admin-logs', requireLogin, requireOwner, (req, res) => {
    const logs = getData(LOG_FILE);
    const content = logs.map(l => `[${l.time}] ACTION: ${l.action} | Target: ${l.target} | Detail: ${l.detail}`).join('\n');
    const filePath = path.join(__dirname, 'DeathNote.txt'); fs.writeFileSync(filePath, content); res.download(filePath);
});
app.post('/owner/delete-key', requireLogin, requireOwner, (req, res) => { let keys = getData(KEY_FILE); keys = keys.filter(k => k.code !== req.body.keyCode); saveData(KEY_FILE, keys); res.redirect('/owner'); });
app.post('/owner/clear-keys', requireLogin, requireOwner, (req, res) => { saveData(KEY_FILE, []); res.redirect('/owner'); });

// Xử lý BAN/UNBAN (Đã thêm lại)
app.post('/owner/ban', requireLogin, requireOwner, (req, res) => {
    let users = getData(USER_FILE);
    let u = users.find(x => x.username === req.body.target);
    if(u) { u.banned = true; saveData(USER_FILE, users); addAdminLog("BAN", u.username, "Khóa nhanh"); }
    res.redirect('/owner');
});
app.post('/owner/unban', requireLogin, requireOwner, (req, res) => {
    let users = getData(USER_FILE);
    let u = users.find(x => x.username === req.body.target);
    if(u) { u.banned = false; saveData(USER_FILE, users); addAdminLog("UNBAN", u.username, "Mở nhanh"); }
    res.redirect('/owner');
});

app.listen(3000, () => console.log("System FIXED ALL BUGS running..."));