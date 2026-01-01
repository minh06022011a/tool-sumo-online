const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const upload = multer({ dest: 'uploads/' });

// --- CẤU HÌNH HỆ THỐNG ---
const SYSTEM_KEY = "VIP-PRO-MINH"; // Key để user thường kích hoạt
const SECRET_SESSION = "minh_owner_dep_trai";

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

// --- MIDDLEWARE PHÂN QUYỀN ---
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    
    // Check lại database xem có bị ban không
    const users = getData(USER_FILE);
    const u = users.find(x => x.username === req.session.user.username);
    
    if (u && u.banned) {
        req.session.destroy();
        return renderMessage(res, `TÀI KHOẢN BỊ KHÓA!<br>Lý do: ${u.banReason || 'Vi phạm'}`, '/');
    }
    
    req.session.user = u; // Cập nhật session mới nhất
    next();
}

function requireToolAccess(req, res, next) {
    const u = req.session.user;
    // Owner, Admin, Mod được qua luôn. User thường phải có Key
    if (['owner', 'admin', 'mod'].includes(u.role)) return next();
    
    if (u.role === 'user' && !u.hasKey) {
        return res.sendFile(path.join(__dirname, 'active_key.html'));
    }
    next();
}

function requireStaff(req, res, next) {
    if (!['owner', 'admin', 'mod'].includes(req.session.user.role)) {
        return renderMessage(res, 'Bạn không đủ thẩm quyền!', '/tool');
    }
    next();
}

function requireOwner(req, res, next) {
    if (req.session.user.role !== 'owner') {
        return renderMessage(res, 'CHỈ DÀNH CHO OWNER (MINH)!', '/tool');
    }
    next();
}

// --- ROUTER ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));

// ĐĂNG KÝ
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const users = getData(USER_FILE);
    if (users.find(u => u.username === username)) return renderMessage(res, 'Tên trùng!', '/register');

    // Mặc định tạo ra là User. Chỉ có "admin" là Owner.
    let role = 'user';
    if (username === 'admin') role = 'owner';

    users.push({ 
        username, password, role, 
        banned: false, banReason: '', 
        hasKey: false // Mặc định chưa có key
    });
    saveData(USER_FILE, users);
    renderMessage(res, `Đăng ký ${username} thành công!`, '/login');
});

// ĐĂNG NHẬP
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = getData(USER_FILE);
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return renderMessage(res, 'Sai thông tin!', '/login');
    if (user.banned) return renderMessage(res, `TK BỊ KHÓA: ${user.banReason}`, '/');

    req.session.user = user;
    res.redirect('/tool');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// KÍCH HOẠT KEY (Cho user thường)
app.post('/activate-key', requireLogin, (req, res) => {
    const { key } = req.body;
    if (key === SYSTEM_KEY) {
        const users = getData(USER_FILE);
        const idx = users.findIndex(u => u.username === req.session.user.username);
        users[idx].hasKey = true;
        saveData(USER_FILE, users);
        req.session.user.hasKey = true;
        renderMessage(res, 'KÍCH HOẠT THÀNH CÔNG! Chào mừng Vip Member.', '/tool');
    } else {
        res.send(`<script>alert("Key sai rồi! Mua key của Minh đi."); window.history.back();</script>`);
    }
});

// TRANG TOOL (Chính)
app.get('/tool', requireLogin, requireToolAccess, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'tool.html'), 'utf-8');
    const u = req.session.user;
    
    // Menu phân quyền
    let adminLink = '';
    if (u.role === 'owner') adminLink = '<a href="/owner" style="color:red; font-weight:bold; margin-right:15px">👑 OWNER PANEL</a>';
    else if (u.role === 'admin' || u.role === 'mod') adminLink = '<a href="/staff" style="color:orange; margin-right:15px">🛡️ STAFF PANEL</a>';

    let menu = `
        <div style="background:#222; padding:10px; display:flex; justify-content:space-between; align-items:center;">
            <div style="color:#0f0">User: <b>${u.username}</b> [${u.role.toUpperCase()}]</div>
            <div>
                ${adminLink}
                <a href="/profile" style="color:white; margin-right:15px">Hồ sơ</a>
                <a href="/logout" style="color:#888">Thoát</a>
            </div>
        </div>
    `;
    res.send(html.replace('<body>', '<body>' + menu));
});

// --- STAFF PANEL (Admin/Mod) ---
app.get('/staff', requireLogin, requireStaff, (req, res) => {
    const users = getData(USER_FILE);
    let html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');
    
    let rows = users.map(u => `
        <tr>
            <td>${u.username}</td>
            <td>${u.role}</td>
            <td style="color:${u.banned?'red':'green'}">${u.banned ? 'Bị Ban' : 'Sạch'}</td>
            <td>
                ${u.role !== 'owner' ? `
                <form action="/report" method="POST" style="display:inline;">
                    <input type="hidden" name="target" value="${u.username}">
                    <input type="text" name="reason" placeholder="Lý do..." required style="width:100px;">
                    <button type="submit" class="btn-report">BÁO CÁO</button>
                </form>
                ` : '<span>Bất tử</span>'}
            </td>
        </tr>
    `).join('');
    
    res.send(html.replace('{{USER_LIST}}', rows));
});

// GỬI BÁO CÁO (Request)
app.post('/report', requireLogin, requireStaff, (req, res) => {
    const { target, reason } = req.body;
    const reqs = getData(REQ_FILE);
    
    reqs.push({
        id: Date.now(),
        reporter: req.session.user.username,
        role: req.session.user.role,
        target: target,
        reason: reason,
        time: new Date().toLocaleString()
    });
    
    saveData(REQ_FILE, reqs);
    renderMessage(res, 'Đã gửi sớ lên Owner Minh thành công!', '/staff');
});

// --- OWNER PANEL (Tối cao) ---
app.get('/owner', requireLogin, requireOwner, (req, res) => {
    const reqs = getData(REQ_FILE);
    let html = fs.readFileSync(path.join(__dirname, 'owner.html'), 'utf-8');
    
    let rows = reqs.length === 0 ? '<p>Hộp thư trống!</p>' : reqs.map(r => `
        <div class="request-box">
            <div style="color:orange;">🆘 BÁO CÁO TỪ: <b>${r.reporter}</b> (${r.role})</div>
            <div>Tố cáo: <b style="color:red">${r.target}</b></div>
            <div>Lý do: <i>${r.reason}</i></div>
            <div>Thời gian: ${r.time}</div>
            
            <form action="/owner-action" method="POST" class="actions">
                <input type="hidden" name="reqId" value="${r.id}">
                <input type="hidden" name="target" value="${r.target}">
                
                <select name="action">
                    <option value="ban_forever">Cấm vĩnh viễn</option>
                    <option value="ban_7day">Cấm 7 ngày (Demo)</option>
                    <option value="lock">Khóa mõm (Khóa tạm)</option>
                </select>
                
                <button type="submit" name="decision" value="approve" class="btn-approve">DUYỆT & TRẢM</button>
                <button type="submit" name="decision" value="reject" class="btn-delete">XÓA ĐƠN</button>
            </form>
        </div>
    `).join('');

    res.send(html.replace('{{COUNT}}', reqs.length).replace('{{REQUEST_LIST}}', rows));
});

// OWNER XỬ LÝ
app.post('/owner-action', requireLogin, requireOwner, (req, res) => {
    const { reqId, target, action, decision } = req.body;
    let reqs = getData(REQ_FILE);
    let users = getData(USER_FILE);

    // Xóa đơn khỏi hộp thư
    reqs = reqs.filter(r => r.id != reqId);
    saveData(REQ_FILE, reqs);

    if (decision === 'reject') {
        return res.redirect('/owner'); // Xóa đơn thì thôi, quay lại
    }

    // Nếu duyệt -> Tìm user và trảm
    const uIdx = users.findIndex(u => u.username === target);
    if (uIdx !== -1) {
        users[uIdx].banned = true;
        users[uIdx].banReason = `Quyết định bởi Owner (Loại: ${action})`;
        saveData(USER_FILE, users);
        renderMessage(res, `Đã thi hành án ${action} với ${target}!`, '/owner');
    } else {
        renderMessage(res, 'User này không tồn tại!', '/owner');
    }
});

// GIỮ NGUYÊN PHẦN PROFILE VÀ UPLOAD CŨ
app.get('/profile', requireLogin, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'profile.html'), 'utf-8');
    const u = req.session.user;
    // ... (Giữ nguyên logic replace cũ của em) ...
    html = html.replace('{{USERNAME}}', u.username).replace('{{ROLE}}', u.role).replace('{{STATUS}}', u.banned ? 'BỊ BAN' : (u.hasKey ? 'VIP MEMBER' : 'Chưa Active'));
    res.send(html);
});

// ... (Giữ nguyên phần đổi pass và upload video ở bài trước) ...
app.post('/change-password', requireLogin, (req, res) => { /* Code cũ... */ });
app.post('/upload', requireLogin, requireToolAccess, upload.single('video'), (req, res) => { /* Code cũ... */ });

app.listen(3000, () => console.log("System HIERARCHY running..."));