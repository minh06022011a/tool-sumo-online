const express = require('express');
const session = require('express-session'); // Thư viện nhớ đăng nhập
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Cấu hình Session (Bộ nhớ)
app.use(session({
    secret: 'minh_dep_trai_khoai_to_iq_vo_cuc', // Khóa bí mật (đừng cho ai biết)
    resave: false,
    saveUninitialized: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'users.json');

// --- HÀM HỖ TRỢ ---
function getUsers() {
    if (!fs.existsSync(DATA_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DATA_FILE)); } catch { return []; }
}

function saveAllUsers(users) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

function renderMessage(res, msg, link) {
    let tpl = fs.readFileSync(path.join(__dirname, 'message.html'), 'utf-8');
    tpl = tpl.replace('REPLACE_MESSAGE', msg).replace('REPLACE_LINK', link);
    res.send(tpl);
}

// --- MIDDLEWARE (Lính gác cổng) ---
// Kiểm tra xem đã đăng nhập chưa
function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    // Kiểm tra xem có bị khóa nick không
    const users = getUsers();
    const currentUser = users.find(u => u.username === req.session.user.username);
    if (currentUser && currentUser.banned) {
        req.session.destroy();
        return renderMessage(res, 'TÀI KHOẢN CỦA BẠN ĐÃ BỊ KHÓA BỞI ADMIN!', '/');
    }
    next();
}

// Kiểm tra xem có phải Admin không
function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return renderMessage(res, 'BẠN KHÔNG CÓ QUYỀN TRUY CẬP ADMIN!', '/tool');
    }
    next();
}

// --- ROUTER CHÍNH ---

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));

// ĐĂNG KÝ (Tự động set Admin cho nick tên là 'admin')
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    
    if (users.find(u => u.username === username)) {
        return renderMessage(res, 'Tên này đã có người dùng!', '/register');
    }

    // Logic: Nếu tên là 'admin' thì cho làm Admin, còn lại là User thường
    const role = (username === 'admin') ? 'admin' : 'user';

    users.push({ 
        username, 
        password, 
        role: role, 
        banned: false,
        created_at: new Date().toLocaleString()
    });
    
    saveAllUsers(users);
    renderMessage(res, `Tạo tài khoản <b>${username}</b> thành công!`, '/login');
});

// ĐĂNG NHẬP
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) return renderMessage(res, 'Sai tài khoản hoặc mật khẩu!', '/login');
    if (user.banned) return renderMessage(res, 'TÀI KHOẢN NÀY ĐÃ BỊ CẤM!', '/');

    // Lưu vào bộ nhớ Session
    req.session.user = user;
    res.redirect('/tool'); // Vào thẳng tool luôn
});

// ĐĂNG XUẤT
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// TRANG TOOL (Phải đăng nhập mới xem được)
app.get('/tool', requireLogin, (req, res) => {
    // Đọc file tool.html và thay thế menu cho xịn
    let html = fs.readFileSync(path.join(__dirname, 'tool.html'), 'utf-8');
    
    // Tạo menu động
    let menuHtml = `
        <div style="background: #333; padding: 10px; display:flex; justify-content:space-between;">
            <div style="color:#0f0">Xin chào, <b>${req.session.user.username}</b> (${req.session.user.role})</div>
            <div>
                ${req.session.user.role === 'admin' ? '<a href="/admin" style="color:yellow; margin-right:15px">QUẢN LÝ ADMIN</a>' : ''}
                <a href="/profile" style="color:white; margin-right:15px">Hồ sơ & Đổi Pass</a>
                <a href="/logout" style="color:red">Thoát</a>
            </div>
        </div>
    `;
    
    // Thay thế đoạn menu cũ bằng menu mới (Em nhớ tìm chỗ nào trong tool.html để replace nhé, hoặc anh replace đè lên thẻ body cho nhanh)
    // Cách an toàn: Chèn vào đầu body
    html = html.replace('<body>', '<body>' + menuHtml);
    res.send(html);
});

// --- TÍNH NĂNG PROFILE ---
app.get('/profile', requireLogin, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'profile.html'), 'utf-8');
    const u = req.session.user;
    html = html.replace('{{USERNAME}}', u.username)
               .replace('{{ROLE}}', u.role)
               .replace('{{STATUS}}', u.banned ? 'BỊ KHÓA' : 'HOẠT ĐỘNG');
    res.send(html);
});

app.post('/change-password', requireLogin, (req, res) => {
    const { oldPass, newPass } = req.body;
    const users = getUsers();
    const idx = users.findIndex(u => u.username === req.session.user.username);

    if (users[idx].password !== oldPass) {
        return renderMessage(res, 'Mật khẩu cũ không đúng!', '/profile');
    }

    users[idx].password = newPass;
    saveAllUsers(users);
    res.send(`<script>alert("Đổi mật khẩu thành công! Hãy đăng nhập lại."); window.location.href="/logout";</script>`);
});

// --- TÍNH NĂNG ADMIN SIÊU CẤP ---
app.get('/admin', requireAdmin, (req, res) => {
    const users = getUsers();
    let html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');
    
    // Tạo bảng user
    let userRows = users.map(u => `
        <tr>
            <td>${u.username}</td>
            <td style="color:${u.role === 'admin' ? 'yellow' : 'white'}">${u.role}</td>
            <td style="color:${u.banned ? 'red' : 'green'}">${u.banned ? 'BỊ CẤM' : 'Hoạt động'}</td>
            <td>
                ${u.username !== 'admin' ? `
                    <a href="/admin/ban/${u.username}" class="btn ban-btn">${u.banned ? 'MỞ KHÓA' : 'KHÓA NICK'}</a>
                    <a href="/admin/reset/${u.username}" class="btn reset-btn">RESET PASS</a>
                ` : '<span>BOSS (Bất tử)</span>'}
            </td>
        </tr>
    `).join('');

    html = html.replace('{{TOTAL_USERS}}', users.length);
    html = html.replace('{{USER_LIST}}', userRows);
    res.send(html);
});

// Admin: Khóa/Mở khóa User
app.get('/admin/ban/:username', requireAdmin, (req, res) => {
    const users = getUsers();
    const u = users.find(u => u.username === req.params.username);
    if (u && u.username !== 'admin') {
        u.banned = !u.banned; // Đổi trạng thái (True thành False, False thành True)
        saveAllUsers(users);
    }
    res.redirect('/admin');
});

// Admin: Reset mật khẩu về 123456
app.get('/admin/reset/:username', requireAdmin, (req, res) => {
    const users = getUsers();
    const u = users.find(u => u.username === req.params.username);
    if (u) {
        u.password = '123456';
        saveAllUsers(users);
        res.send(`<script>alert("Đã reset mật khẩu của [${u.username}] về 123456"); window.location.href="/admin";</script>`);
    } else {
        res.redirect('/admin');
    }
});

// UPLOAD VIDEO (Giữ nguyên)
app.post('/upload', requireLogin, upload.single('video'), (req, res) => {
    // ... (Giữ nguyên đoạn convert cũ của em ở đây) ...
    // Copy đoạn convert từ bài trước dán vào đây nhé
     if (!req.file) return renderMessage(res, 'Vui lòng chọn file video!', '/tool');

    const inputPath = req.file.path;
    const outputName = `video_${Date.now()}.3gp`;
    const outputPath = path.join(__dirname, outputName);
    const command = `"${ffmpegPath}" -i "${inputPath}" -vcodec mpeg4 -acodec libopencore_amrnb -ac 1 -ar 8000 -s 176x144 -r 15 -y "${outputPath}"`;

    exec(command, (error) => {
        if (error) return renderMessage(res, 'Lỗi convert: ' + error.message, '/tool');
        res.download(outputPath, () => { fs.unlinkSync(inputPath); });
    });
});

app.listen(3000, () => console.log("System VIP Pro Max running..."));