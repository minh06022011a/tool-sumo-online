const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const upload = multer({ dest: 'uploads/' });

// --- CẤU HÌNH ---
const SYSTEM_KEY = "VIP-PRO-MINH"; 
const SECRET_SESSION = "minh_owner_badao";

app.use(session({
    secret: SECRET_SESSION,
    resave: false,
    saveUninitialized: true
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const USER_FILE = path.join(__dirname, 'users.json');
const REQ_FILE = path.join(__dirname, 'requests.json');

// --- HÀM HỖ TRỢ ---
function getData(file) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
    try { return JSON.parse(fs.readFileSync(file)); } catch { return []; }
}
function saveData(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function renderMessage(res, msg, link) {
    let tpl = fs.readFileSync(path.join(__dirname, 'message.html'), 'utf-8');
    res.send(tpl.replace('REPLACE_MESSAGE', msg).replace('REPLACE_LINK', link));
}

// --- MIDDLEWARE ---
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    const users = getData(USER_FILE);
    const u = users.find(x => x.username === req.session.user.username);
    if (u && u.banned) {
        req.session.destroy();
        return renderMessage(res, `TÀI KHOẢN BỊ KHÓA!<br>Lý do: ${u.banReason}`, '/');
    }
    req.session.user = u; 
    next();
}

function requireToolAccess(req, res, next) {
    const u = req.session.user;
    if (['owner', 'admin', 'mod'].includes(u.role)) return next();
    if (u.role === 'user' && !u.hasKey) return res.sendFile(path.join(__dirname, 'active_key.html'));
    next();
}

function requireStaff(req, res, next) {
    if (!['owner', 'admin', 'mod'].includes(req.session.user.role)) return renderMessage(res, 'Không đủ quyền hạn!', '/tool');
    next();
}

function requireOwner(req, res, next) {
    if (req.session.user.role !== 'owner') return renderMessage(res, 'CHỈ DÀNH CHO OWNER (MINH)!', '/tool');
    next();
}

// --- ROUTER ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const users = getData(USER_FILE);
    if (users.find(u => u.username === username)) return renderMessage(res, 'Tên trùng!', '/register');
    let role = (username === 'admin') ? 'owner' : 'user';
    users.push({ username, password, role, banned: false, banReason: '', hasKey: false });
    saveData(USER_FILE, users);
    renderMessage(res, `Đăng ký ${username} thành công!`, '/login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = getData(USER_FILE);
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return renderMessage(res, 'Sai thông tin!', '/login');
    if (user.banned) return renderMessage(res, `BỊ BAN: ${user.banReason}`, '/');
    req.session.user = user;
    res.redirect('/tool');
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.post('/activate-key', requireLogin, (req, res) => {
    if (req.body.key === SYSTEM_KEY) {
        const users = getData(USER_FILE);
        const idx = users.findIndex(u => u.username === req.session.user.username);
        users[idx].hasKey = true;
        saveData(USER_FILE, users);
        renderMessage(res, 'KÍCH HOẠT THÀNH CÔNG!', '/tool');
    } else res.send(`<script>alert("Key sai!"); window.history.back();</script>`);
});

app.get('/tool', requireLogin, requireToolAccess, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'tool.html'), 'utf-8');
    const u = req.session.user;
    let adminLink = '';
    if (u.role === 'owner') adminLink = '<a href="/owner" style="color:red; font-weight:bold; margin-right:15px">👑 OWNER PANEL</a>';
    else if (u.role === 'admin' || u.role === 'mod') adminLink = '<a href="/staff" style="color:orange; margin-right:15px">🛡️ STAFF PANEL</a>';
    
    let menu = `<div style="background:#222; padding:10px; display:flex; justify-content:space-between;">
        <div style="color:#0f0">User: <b>${u.username}</b> [${u.role.toUpperCase()}]</div>
        <div>${adminLink}<a href="/profile" style="color:white; margin-right:15px">Hồ sơ</a><a href="/logout" style="color:#888">Thoát</a></div>
    </div>`;
    res.send(html.replace('<body>', '<body>' + menu));
});

// --- STAFF (ADMIN/MOD) ---
app.get('/staff', requireLogin, requireStaff, (req, res) => {
    const users = getData(USER_FILE);
    let html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');
    let rows = users.map(u => `<tr><td>${u.username}</td><td>${u.role}</td><td style="color:${u.banned?'red':'green'}">${u.banned?'Bị Ban':'Sạch'}</td>
        <td>${u.role!=='owner'?`<form action="/report" method="POST" style="display:inline;"><input type="hidden" name="target" value="${u.username}"><input type="text" name="reason" placeholder="Lý do..." required style="width:100px;"><button class="btn-report">BÁO CÁO</button></form>`:'<span>Bất tử</span>'}</td></tr>`).join('');
    res.send(html.replace('{{USER_LIST}}', rows));
});

app.post('/report', requireLogin, requireStaff, (req, res) => {
    const reqs = getData(REQ_FILE);
    reqs.push({ id: Date.now(), reporter: req.session.user.username, role: req.session.user.role, target: req.body.target, reason: req.body.reason, time: new Date().toLocaleString() });
    saveData(REQ_FILE, reqs);
    renderMessage(res, 'Đã gửi sớ lên Owner!', '/staff');
});

// --- OWNER (TỐI CAO) ---
app.get('/owner', requireLogin, requireOwner, (req, res) => {
    const reqs = getData(REQ_FILE);
    const users = getData(USER_FILE);
    let html = fs.readFileSync(path.join(__dirname, 'owner.html'), 'utf-8');

    // 1. Render Hộp thư
    let reqRows = reqs.length === 0 ? '<p style="color:#888">Không có báo cáo nào.</p>' : reqs.map(r => `
        <div class="request-box">
            <div>
                <b style="color:orange">${r.reporter}</b> tố cáo <b style="color:red">${r.target}</b><br>
                <i>"${r.reason}"</i>
            </div>
            <form action="/owner-action" method="POST">
                <input type="hidden" name="reqId" value="${r.id}">
                <input type="hidden" name="target" value="${r.target}">
                <select name="action">
                    <option value="ban_forever">Cấm vĩnh viễn</option>
                    <option value="lock">Khóa mõm</option>
                </select>
                <button type="submit" name="decision" value="approve" class="btn-kill">TRẢM</button>
                <button type="submit" name="decision" value="reject">XÓA</button>
            </form>
        </div>`).join('');

    // 2. Render Bảng nhân sự (Quản lý Role)
    let userRows = users.map(u => {
        if (u.role === 'owner') return ''; // Không hiện Owner trong bảng này để tránh lỡ tay tự giết mình
        let roleColor = u.role === 'admin' ? 'role-admin' : (u.role === 'mod' ? 'role-mod' : 'role-user');
        return `
        <tr>
            <td>${u.username}</td>
            <td><span class="role-tag ${roleColor}">${u.role.toUpperCase()}</span></td>
            <td style="color:${u.banned?'red':'#0f0'}">${u.banned?'ĐANG BỊ KHÓA':'HOẠT ĐỘNG'}</td>
            <td>
                <form action="/owner/set-role" method="POST" style="display:flex; gap:5px;">
                    <input type="hidden" name="targetUser" value="${u.username}">
                    <select name="newRole">
                        <option value="user" ${u.role==='user'?'selected':''}>User</option>
                        <option value="mod" ${u.role==='mod'?'selected':''}>Mod</option>
                        <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                    </select>
                    <button type="submit" class="btn-save">LƯU</button>
                </form>
            </td>
        </tr>`;
    }).join('');

    html = html.replace('{{COUNT}}', reqs.length)
               .replace('{{REQUEST_LIST}}', reqRows)
               .replace('{{USER_MANAGEMENT_LIST}}', userRows);
    res.send(html);
});

// Owner: Xử lý báo cáo
app.post('/owner-action', requireLogin, requireOwner, (req, res) => {
    let reqs = getData(REQ_FILE);
    let users = getData(USER_FILE);
    reqs = reqs.filter(r => r.id != req.body.reqId);
    saveData(REQ_FILE, reqs);

    if (req.body.decision === 'approve') {
        const uIdx = users.findIndex(u => u.username === req.body.target);
        if (uIdx !== -1) {
            users[uIdx].banned = true;
            users[uIdx].banReason = "Trảm bởi Owner Minh";
            saveData(USER_FILE, users);
            return renderMessage(res, `Đã trảm ${req.body.target}!`, '/owner');
        }
    }
    res.redirect('/owner');
});

// Owner: Set Role (Thăng chức/Giáng chức)
app.post('/owner/set-role', requireLogin, requireOwner, (req, res) => {
    const { targetUser, newRole } = req.body;
    let users = getData(USER_FILE);
    const uIdx = users.findIndex(u => u.username === targetUser);

    if (uIdx !== -1) {
        users[uIdx].role = newRole;
        saveData(USER_FILE, users);
        renderMessage(res, `Đã cập nhật chức vụ của <b>${targetUser}</b> thành <b>${newRole.toUpperCase()}</b>!`, '/owner');
    } else {
        renderMessage(res, 'Không tìm thấy user!', '/owner');
    }
});

// Profile & Upload
app.get('/profile', requireLogin, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'profile.html'), 'utf-8');
    const u = req.session.user;
    html = html.replace('{{USERNAME}}', u.username).replace('{{ROLE}}', u.role).replace('{{STATUS}}', u.banned ? 'BỊ BAN' : (u.hasKey ? 'VIP MEMBER' : 'Chưa Active'));
    res.send(html);
});

app.post('/change-password', requireLogin, (req, res) => {
    const { oldPass, newPass } = req.body;
    let users = getData(USER_FILE);
    const idx = users.findIndex(u => u.username === req.session.user.username);
    if (users[idx].password !== oldPass) return renderMessage(res, 'Mật khẩu cũ sai!', '/profile');
    users[idx].password = newPass;
    saveData(USER_FILE, users);
    renderMessage(res, 'Đổi mật khẩu thành công! Đăng nhập lại.', '/logout');
});

app.post('/upload', requireLogin, requireToolAccess, upload.single('video'), (req, res) => {
    if (!req.file) return renderMessage(res, 'Chưa chọn file!', '/tool');
    const inputPath = req.file.path;
    const outputPath = path.join(__dirname, `video_${Date.now()}.3gp`);
    const command = `"${ffmpegPath}" -i "${inputPath}" -vcodec mpeg4 -acodec libopencore_amrnb -ac 1 -ar 8000 -s 176x144 -r 15 -y "${outputPath}"`;
    exec(command, (e) => {
        if (e) return renderMessage(res, 'Lỗi: ' + e.message, '/tool');
        res.download(outputPath, () => fs.unlinkSync(inputPath));
    });
});

app.listen(3000, () => console.log("System VIP PRO MAX running..."));