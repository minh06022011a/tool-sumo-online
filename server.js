const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const upload = multer({ dest: 'uploads/' });

const SECRET_SESSION = "minh_boss_pro_max_v3";

// LOGO VIP
const VIP_LOGO = `<a href="/" style="position:fixed;top:10px;left:10px;z-index:9999;font-weight:900;color:white;text-decoration:none;text-shadow:0 0 5px #0f0;font-size:18px;">⚡ CONVERT <span style="background:linear-gradient(90deg,red,yellow,lime);color:black;padding:2px 5px;border-radius:4px;">PRO MAX</span></a>`;

// Cần cái này để lấy IP chuẩn trên Render
app.set('trust proxy', true); 

app.use(session({ secret: SECRET_SESSION, resave: false, saveUninitialized: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// FILE DATA
const USER_FILE = path.join(__dirname, 'users.json');
const LOG_FILE = path.join(__dirname, 'logs.json');
const USER_LOG_FILE = path.join(__dirname, 'user_logs.json');
const KEY_FILE = path.join(__dirname, 'active_keys.json');

// HÀM HỖ TRỢ
function getData(file) { if (!fs.existsSync(file)) fs.writeFileSync(file, '[]'); try { return JSON.parse(fs.readFileSync(file)); } catch { return []; } }
function saveData(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function injectLogo(html) { return html.replace(/(<body[^>]*>)/i, '$1' + VIP_LOGO); }
function renderMessage(res, msg, link) { let tpl = fs.readFileSync(path.join(__dirname, 'message.html'), 'utf-8'); res.send(injectLogo(tpl.replace('REPLACE_MESSAGE', msg).replace('REPLACE_LINK', link))); }

// TẠO KEY NGẪU NHIÊN
function generateRandomKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Bỏ I, 1, O, 0 cho đỡ nhầm
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
    // CHỖ NÀY LÁT EM THAY LINK YEUMONEY CỦA EM VÀO NHÉ
    // Ví dụ: href="https://yeumoney.com/123xyz"
    // Hiện tại anh để link trực tiếp để test
    html = html.replace('href="https://zalo.me/sdt_cua_em"', 'href="/lay-key-tu-dong"'); 
    res.send(injectLogo(html));
}

// --- ROUTER CHÍNH ---
app.get('/', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'))));
app.get('/login', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'login.html'), 'utf-8'))));
app.get('/register', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'register.html'), 'utf-8'))));
app.post('/register', (req, res) => {
    const { username, password } = req.body; let users = getData(USER_FILE);
    if (users.find(u => u.username === username)) return renderMessage(res, 'Trùng tên!', '/register');
    let role = (username === 'admin') ? 'owner' : 'user';
    users.push({ username, password, role, banned: false }); saveData(USER_FILE, users);
    renderMessage(res, `Tạo nick ${username} thành công!`, '/login');
});
app.post('/login', (req, res) => {
    const { username, password } = req.body; const users = getData(USER_FILE);
    const u = users.find(x => x.username === username && x.password === password);
    if (!u) return renderMessage(res, 'Sai thông tin!', '/login');
    req.session.user = u; res.redirect('/tool');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- HỆ THỐNG AUTO KEY (CHECK IP) ---

// Trang đích của Yeumoney (Link ẩn)
app.get('/lay-key-tu-dong', (req, res) => {
    // 1. Lấy IP của khách
    const userIP = req.ip || req.connection.remoteAddress;
    
    let keys = getData(KEY_FILE);
    const now = Date.now();

    // 2. Kiểm tra xem IP này đã có key nào còn hạn không?
    let existingKey = keys.find(k => k.ip === userIP && k.expires > now);

    let keyToShow = "";

    if (existingKey) {
        // Nếu đã có key còn hạn -> Trả lại key cũ (Không tạo mới)
        keyToShow = existingKey.code;
    } else {
        // Nếu chưa có hoặc key cũ đã hết hạn -> Tạo key mới
        const newKey = generateRandomKey();
        const expireTime = now + (24 * 60 * 60 * 1000); // 24h

        keys.push({
            code: newKey,
            ip: userIP, // Lưu IP để check
            created: now,
            expires: expireTime,
            usedBy: null
        });
        saveData(KEY_FILE, keys);
        keyToShow = newKey;
    }

    // Hiển thị Key
    let html = fs.readFileSync(path.join(__dirname, 'key_display.html'), 'utf-8');
    html = html.replace('{{GENERATED_KEY}}', keyToShow);
    res.send(html);
});

// Xử lý nhập Key
app.post('/activate-key', requireLogin, (req, res) => {
    const { key } = req.body;
    let keys = getData(KEY_FILE);
    let users = getData(USER_FILE);
    
    // Tìm key
    const keyData = keys.find(k => k.code === key.trim());

    if (keyData) {
        if (Date.now() > keyData.expires) return renderMessage(res, 'Key này đã hết hạn!', '/logout');
        
        // Kích hoạt VIP
        const uIdx = users.findIndex(u => u.username === req.session.user.username);
        users[uIdx].role = 'vip';
        saveData(USER_FILE, users);

        // Đánh dấu người dùng
        keyData.usedBy = req.session.user.username;
        saveData(KEY_FILE, keys);

        renderMessage(res, `LÊN VIP THÀNH CÔNG!<br>Hạn dùng: 24 giờ.`, '/tool');
    } else {
        renderMessage(res, 'Key không tồn tại!', '/logout');
    }
});

// TOOL
app.get('/tool', requireLogin, requireVip, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'tool.html'), 'utf-8'); const u = req.session.user;
    let adminBtn = (u.role === 'owner') ? '<a href="/owner" style="color:red;font-weight:bold;margin-right:10px;">👑 OWNER PANEL</a>' : '';
    let menu = VIP_LOGO + `<div style="background:#222;padding:10px 10px 10px 180px;color:#0f0;border-bottom:1px solid lime;">Hello <b>${u.username}</b> [${u.role.toUpperCase()}] | ${adminBtn} <a href="/logout" style="color:white;">Thoát</a></div>`;
    res.send(html.replace('<body>', '<body>' + menu));
});

// OWNER PANEL
app.get('/owner', requireLogin, requireOwner, (req, res) => {
    const users = getData(USER_FILE); const keys = getData(KEY_FILE);
    let html = fs.readFileSync(path.join(__dirname, 'owner.html'), 'utf-8');
    
    // List Key có hiện IP
    let keyRows = keys.map(k => {
        let isExpired = Date.now() > k.expires;
        let timeLeft = Math.round((k.expires - Date.now()) / 1000 / 60);
        return `
            <tr>
                <td style="color:yellow; font-weight:bold;">${k.code}</td>
                <td>${k.ip || 'N/A'}</td> <td style="color:${isExpired?'red':'lime'}">${isExpired ? 'Hết hạn' : timeLeft + 'p'}</td>
                <td>${k.usedBy || '-'}</td>
                <td><form action="/owner/delete-key" method="POST"><input type="hidden" name="keyCode" value="${k.code}"><button style="background:red;color:white;border:none;">Xóa</button></form></td>
            </tr>`;
    }).join('');

    let uHtml = users.map(u => {
        if(u.role === 'owner') return '';
        return `<tr><td>${u.username}</td><td>${u.role}</td><td style="color:${u.banned?'red':'lime'}">${u.banned?'BLOCK':'OK'}</td><td>Action...</td></tr>`;
    }).join('');

    html = injectLogo(html);
    html = html.replace('{{KEY_COUNT}}', keys.length);
    html = html.replace('{{KEY_LIST}}', keyRows);
    html = html.replace('{{USER_LOGS}}', ''); html = html.replace('{{ADMIN_LOGS}}', ''); html = html.replace('{{USER_LIST}}', uHtml);
    res.send(html);
});

// Các action khác (Delete key, clear keys...)
app.post('/owner/delete-key', requireLogin, requireOwner, (req, res) => { let keys = getData(KEY_FILE); keys = keys.filter(k => k.code !== req.body.keyCode); saveData(KEY_FILE, keys); res.redirect('/owner'); });
app.post('/owner/clear-keys', requireLogin, requireOwner, (req, res) => { saveData(KEY_FILE, []); res.redirect('/owner'); });
app.post('/upload', requireLogin, requireVip, upload.single('video'), (req, res) => { if(!req.file) return renderMessage(res, 'Chưa chọn file!', '/tool'); const input = req.file.path; const output = path.join(__dirname, `video_${Date.now()}.3gp`); const cmd = `"${ffmpegPath}" -i "${input}" -vcodec mpeg4 -acodec libopencore_amrnb -ac 1 -ar 8000 -s 176x144 -r 15 -y "${output}"`; exec(cmd, (e) => { if(e) return renderMessage(res, 'Lỗi: ' + e.message, '/tool'); res.download(output, () => fs.unlinkSync(input)); }); });

app.listen(3000, () => console.log("System AUTO KEY & IP CHECK running..."));