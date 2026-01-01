const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const upload = multer({ dest: 'uploads/' });

const SYSTEM_KEY = "VIP-PRO-MINH";
const SECRET_SESSION = "minh_owner_badao_vutru";

// --- LOGO VIP RGB ---
const VIP_LOGO = `
<style>
    @keyframes rainbow-bg { 
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }
    .promax-badge {
        background: linear-gradient(270deg, #ff0000, #ff8800, #ffff00, #00ff00, #0099ff, #6600ff, #ff00de);
        background-size: 400% 400%;
        animation: rainbow-bg 3s ease infinite;
        color: white; padding: 3px 6px; border-radius: 4px; font-size: 12px; margin-left: 8px; 
        box-shadow: 0 0 10px rgba(255,255,255,0.6); font-weight: bold; text-shadow: 1px 1px 2px black;
    }
</style>
<a href="/" style="position: fixed; top: 15px; left: 20px; z-index: 99999; text-decoration: none; font-family: sans-serif; font-weight: 900; font-size: 20px; color: white; display: flex; align-items: center; text-shadow: 0 0 10px rgba(0,255,0,0.7); letter-spacing: 1px;">
    <span style="font-size: 26px; margin-right: 5px; color: yellow; filter: drop-shadow(0 0 5px yellow);">⚡</span> 
    CONVERT 
    <span class="promax-badge">PRO MAX</span>
</a>
`;

app.use(session({ secret: SECRET_SESSION, resave: false, saveUninitialized: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const USER_FILE = path.join(__dirname, 'users.json');
const REQ_FILE = path.join(__dirname, 'requests.json');
const LOG_FILE = path.join(__dirname, 'logs.json');

function getData(file) { if (!fs.existsSync(file)) fs.writeFileSync(file, '[]'); try { return JSON.parse(fs.readFileSync(file)); } catch { return []; } }
function saveData(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function injectLogo(html) { return html.replace(/(<body[^>]*>)/i, '$1' + VIP_LOGO); }
function renderMessage(res, msg, link) { let tpl = fs.readFileSync(path.join(__dirname, 'message.html'), 'utf-8'); tpl = injectLogo(tpl); res.send(tpl.replace('REPLACE_MESSAGE', msg).replace('REPLACE_LINK', link)); }

function addLog(action, target, detail) {
    let logs = getData(LOG_FILE);
    logs.unshift({ time: new Date().toLocaleString(), action: action, target: target, detail: detail });
    if (logs.length > 100) logs.pop(); // Lưu 100 dòng thôi
    saveData(LOG_FILE, logs);
}

// Tự tạo admin nếu mất
function initOwner() {
    let users = getData(USER_FILE);
    const ownerExists = users.find(u => u.username === 'admin');
    if (!ownerExists) {
        users.push({ username: "admin", password: "123", role: "owner", banned: false, banReason: "", banUntil: 0, hasKey: true });
        saveData(USER_FILE, users);
    }
}
initOwner();

// MIDDLEWARE
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    const users = getData(USER_FILE);
    const u = users.find(x => x.username === req.session.user.username);
    if (!u) { req.session.destroy(); return res.redirect('/login'); } // User bị xóa do update thì đá ra
    if (u.banned) {
        if (u.banUntil === -1) { req.session.destroy(); return renderMessage(res, `BỊ KHÓA VĨNH VIỄN!<br>${u.banReason}`, '/'); }
        else if (u.banUntil > Date.now()) { let d = new Date(u.banUntil); req.session.destroy(); return renderMessage(res, `BỊ KHÓA TẠM THỜI!<br>Mở lúc: <b>${d.toLocaleString()}</b><br>${u.banReason}`, '/'); }
        else { u.banned = false; u.banUntil = 0; saveData(USER_FILE, users); }
    }
    req.session.user = u; next();
}
function requireOwner(req, res, next) { if (!req.session.user || req.session.user.role !== 'owner') return renderMessage(res, 'CHỈ DÀNH CHO OWNER!', '/tool'); next(); }
function requireToolAccess(req, res, next) { const u = req.session.user; if (['owner', 'admin', 'mod'].includes(u.role)) return next(); if (u.role === 'user' && !u.hasKey) { let html = fs.readFileSync(path.join(__dirname, 'active_key.html'), 'utf-8'); return res.send(injectLogo(html)); } next(); }
function requireStaff(req, res, next) { if (!['owner', 'admin', 'mod'].includes(req.session.user.role)) return renderMessage(res, 'Không đủ quyền!', '/tool'); next(); }

// ROUTER
app.get('/', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'))));
app.get('/login', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'login.html'), 'utf-8'))));
app.get('/register', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'register.html'), 'utf-8'))));
app.post('/register', (req, res) => {
    const { username, password } = req.body; const users = getData(USER_FILE);
    if (users.find(u => u.username === username)) return renderMessage(res, 'Tên trùng!', '/register');
    let role = (username === 'admin') ? 'owner' : 'user';
    users.push({ username, password, role, banned: false, banReason: '', banUntil: 0, hasKey: false });
    saveData(USER_FILE, users); renderMessage(res, `Đăng ký ${username} thành công!`, '/login');
});
app.post('/login', (req, res) => {
    const { username, password } = req.body; const users = getData(USER_FILE);
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return renderMessage(res, 'Sai thông tin (Hoặc TK đã mất do update)!', '/login'); 
    req.session.user = user; res.redirect('/tool');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.post('/activate-key', requireLogin, (req, res) => { if (req.body.key === SYSTEM_KEY) { const users = getData(USER_FILE); const idx = users.findIndex(u => u.username === req.session.user.username); users[idx].hasKey = true; saveData(USER_FILE, users); renderMessage(res, 'ACTIVE THÀNH CÔNG!', '/tool'); } else renderMessage(res, 'Sai Key!', '/logout'); });

app.get('/tool', requireLogin, requireToolAccess, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'tool.html'), 'utf-8'); const u = req.session.user;
    let adminLink = ''; if (u.role === 'owner') adminLink = '<a href="/owner" style="color:red; font-weight:bold; margin-right:15px">👑 OWNER PANEL</a>'; else if (u.role === 'admin' || u.role === 'mod') adminLink = '<a href="/staff" style="color:orange; margin-right:15px">🛡️ STAFF PANEL</a>';
    let menu = VIP_LOGO + `<div style="background:#222; padding:10px 10px 10px 180px; display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #0f0;"><div style="color:#0f0">User: <b>${u.username}</b> [${u.role.toUpperCase()}]</div><div>${adminLink}<a href="/profile" style="color:white; margin-right:15px">Hồ sơ</a><a href="/logout" style="color:#888">Thoát</a></div></div>`;
    res.send(html.replace('<body>', '<body>' + menu));
});

// OWNER PANEL
app.get('/owner', requireLogin, requireOwner, (req, res) => {
    const reqs = getData(REQ_FILE); const users = getData(USER_FILE); const logs = getData(LOG_FILE);
    let html = fs.readFileSync(path.join(__dirname, 'owner.html'), 'utf-8');
    let logRows = logs.length===0 ? '<div style="padding:10px">Sổ Nam Tào trống...</div>' : logs.map(l => `<div class="log-item"><span class="log-time">[${l.time}]</span><span class="log-action act-${l.action.toLowerCase()}">${l.action}</span>: ${l.target} - ${l.detail}</div>`).join('');
    let reqRows = reqs.length===0 ? '<p style="color:#888">Hộp thư trống.</p>' : reqs.map(r => `<div style="border:1px solid #333; padding:10px; margin-bottom:5px;"><b style="color:orange">${r.reporter}</b> báo cáo <b style="color:red">${r.target}</b>: <i>"${r.reason}"</i></div>`).join('');
    
    let userRows = users.map(u => {
        if (u.role === 'owner') return '';
        let roleColor = u.role === 'admin' ? 'role-admin' : (u.role === 'mod' ? 'role-mod' : 'role-user');
        let statusHtml = u.banned ? `<span style="color:red">BỊ KHÓA ${u.banUntil === -1 ? '(Vĩnh viễn)' : '(Có hạn)'}</span>` : `<span style="color:#0f0">Hoạt động</span>`;
        let actionHtml = '';
        if (u.banned) { actionHtml = `<form action="/owner/direct-action" method="POST" style="display:inline"><input type="hidden" name="targetUser" value="${u.username}"><button type="submit" name="actionType" value="unban" class="btn-open">🔓 MỞ</button></form>`; } 
        else { actionHtml = `<form action="/owner/direct-action" method="POST" style="display:inline"><input type="hidden" name="targetUser" value="${u.username}"><select name="banDuration" style="width:100px"><option value="1m">1 Phút (Test)</option><option value="5m">5 Phút</option><option value="30m">30 Phút</option><option value="1h">1 Giờ</option><option value="12h">12 Giờ</option><option value="24h">1 Ngày</option><option value="7d">7 Ngày</option><option value="forever">Vĩnh viễn</option></select><button type="submit" name="actionType" value="ban" class="btn-kill">TRẢM</button></form>`; }
        actionHtml += `<form action="/owner/direct-action" method="POST" style="display:inline; margin-left:5px;"><input type="hidden" name="targetUser" value="${u.username}"><button type="submit" name="actionType" value="reset_pass" class="btn-reset">♻ Pass 123</button></form>`;
        return `<tr><td>${u.username}</td><td><span class="role-tag ${roleColor}">${u.role.toUpperCase()}</span></td><td>${statusHtml}</td><td><form action="/owner/set-role" method="POST" style="display:flex; gap:5px;"><input type="hidden" name="targetUser" value="${u.username}"><select name="newRole"><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="mod" ${u.role==='mod'?'selected':''}>Mod</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select><button type="submit" class="btn-save">Lưu</button></form></td><td>${actionHtml}</td></tr>`;
    }).join('');
    html = injectLogo(html); res.send(html.replace('{{COUNT}}', reqs.length).replace('{{REQUEST_LIST}}', reqRows).replace('{{USER_MANAGEMENT_LIST}}', userRows).replace('{{LOG_LIST}}', logRows));
});

// XUẤT & XÓA LOG MỚI
app.get('/owner/export-logs', requireLogin, requireOwner, (req, res) => {
    res.download(LOG_FILE, 'death_note_logs.json');
});
app.post('/owner/clear-logs', requireLogin, requireOwner, (req, res) => {
    saveData(LOG_FILE, []);
    res.redirect('/owner');
});

// ACTION CŨ
app.post('/owner/direct-action', requireLogin, requireOwner, (req, res) => {
    const { targetUser, actionType, banDuration } = req.body;
    let users = getData(USER_FILE); const idx = users.findIndex(u => u.username === targetUser);
    if (idx === -1) return renderMessage(res, 'User không tồn tại!', '/owner');
    if (actionType === 'ban') {
        users[idx].banned = true; users[idx].banReason = "Trảm bởi Owner"; let ms = 0; let logText = "";
        switch(banDuration) { case '1m': ms=60000; logText="1 phút"; break; case '5m': ms=300000; logText="5 phút"; break; case '30m': ms=1800000; logText="30 phút"; break; case '1h': ms=3600000; logText="1 giờ"; break; case '12h': ms=43200000; logText="12 giờ"; break; case '24h': ms=86400000; logText="1 ngày"; break; case '7d': ms=604800000; logText="7 ngày"; break; case 'forever': default: ms=-1; logText="Vĩnh viễn"; break; }
        users[idx].banUntil = (ms === -1) ? -1 : (Date.now() + ms); addLog("BAN", targetUser, `Khóa ${logText}`);
    } else if (actionType === 'unban') { users[idx].banned = false; users[idx].banUntil = 0; addLog("UNBAN", targetUser, "Đã ân xá"); } 
    else if (actionType === 'reset_pass') { users[idx].password = '123456'; addLog("RESET", targetUser, "Reset pass về 123456"); saveData(USER_FILE, users); return renderMessage(res, `Đã reset pass của <b>${targetUser}</b>!`, '/owner'); }
    saveData(USER_FILE, users); res.redirect('/owner');
});
app.post('/owner/set-role', requireLogin, requireOwner, (req, res) => {
    const { targetUser, newRole } = req.body; let users = getData(USER_FILE); const uIdx = users.findIndex(u => u.username === targetUser);
    if (uIdx !== -1) { users[uIdx].role = newRole; saveData(USER_FILE, users); addLog("ROLE", targetUser, `Thăng/Giáng thành ${newRole}`); renderMessage(res, `Đã set role <b>${targetUser}</b> thành <b>${newRole}</b>!`, '/owner'); } else renderMessage(res, 'Error', '/owner');
});

// CÁC ROUTER KHÁC GIỮ NGUYÊN (Staff, Upload, Profile...)
app.get('/staff', requireLogin, requireStaff, (req, res) => { const users = getData(USER_FILE); let html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8'); let rows = users.map(u => `<tr><td>${u.username}</td><td>${u.role}</td><td style="color:${u.banned?'red':'green'}">${u.banned?'Bị Ban':'Sạch'}</td><td>${u.role!=='owner'?`<form action="/report" method="POST" style="display:inline;"><input type="hidden" name="target" value="${u.username}"><input type="text" name="reason" placeholder="Lý do..." required style="width:100px;"><button class="btn-report">BÁO CÁO</button></form>`:'<span>Bất tử</span>'}</td></tr>`).join(''); html = injectLogo(html); res.send(html.replace('{{USER_LIST}}', rows)); });
app.post('/report', requireLogin, requireStaff, (req, res) => { const reqs = getData(REQ_FILE); reqs.push({ id: Date.now(), reporter: req.session.user.username, role: req.session.user.role, target: req.body.target, reason: req.body.reason, time: new Date().toLocaleString() }); saveData(REQ_FILE, reqs); renderMessage(res, 'Đã gửi sớ lên Owner!', '/staff'); });
app.get('/profile', requireLogin, (req, res) => { let html = fs.readFileSync(path.join(__dirname, 'profile.html'), 'utf-8'); const u = req.session.user; html = injectLogo(html); res.send(html.replace('{{USERNAME}}', u.username).replace('{{ROLE}}', u.role).replace('{{STATUS}}', u.banned ? 'BỊ BAN' : (u.hasKey ? 'VIP MEMBER' : 'Chưa Active'))); });
app.post('/change-password', requireLogin, (req, res) => { const { oldPass, newPass } = req.body; let users = getData(USER_FILE); const idx = users.findIndex(u => u.username === req.session.user.username); if (users[idx].password !== oldPass) return renderMessage(res, 'Pass cũ sai!', '/profile'); users[idx].password = newPass; saveData(USER_FILE, users); renderMessage(res, 'Đổi pass thành công!', '/logout'); });
app.post('/upload', requireLogin, requireToolAccess, upload.single('video'), (req, res) => { if (!req.file) return renderMessage(res, 'Chưa chọn file!', '/tool'); const inputPath = req.file.path; const outputPath = path.join(__dirname, `video_${Date.now()}.3gp`); const command = `"${ffmpegPath}" -i "${inputPath}" -vcodec mpeg4 -acodec libopencore_amrnb -ac 1 -ar 8000 -s 176x144 -r 15 -y "${outputPath}"`; exec(command, (e) => { if (e) return renderMessage(res, 'Lỗi: ' + e.message, '/tool'); res.download(outputPath, () => fs.unlinkSync(inputPath)); }); });

app.listen(3000, () => console.log("System LOG EXPORT running..."));