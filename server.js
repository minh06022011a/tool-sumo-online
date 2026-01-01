const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const upload = multer({ dest: 'uploads/' });

const SECRET_SESSION = "minh_boss_ultimate_security";

// --- LOGO VIP RGB ---
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
app.use(express.json()); // QUAN TRỌNG: Đọc dữ liệu JSON (Vân tay)
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

// HÀM DỊCH THỜI GIAN
function parseDuration(input) {
    if(!input) return 0;
    input = input.toLowerCase().trim();
    if(input === 'vv' || input === 'forever') return -1;
    let totalMs = 0;
    const s = input.match(/(\d+)s/); const m = input.match(/(\d+)m/); const h = input.match(/(\d+)h/); const d = input.match(/(\d+)d/);
    if (s) totalMs += parseInt(s[1]) * 1000;
    if (m) totalMs += parseInt(m[1]) * 60 * 1000;
    if (h) totalMs += parseInt(h[1]) * 60 * 60 * 1000;
    if (d) totalMs += parseInt(d[1]) * 24 * 60 * 60 * 1000;
    if (totalMs === 0 && !isNaN(input)) totalMs = parseInt(input) * 60 * 1000;
    return totalMs;
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
    if (u.banned) {
        if (u.banUntil === -1) return renderMessage(res, `⛔ BẠN ĐÃ BỊ KHÓA VĨNH VIỄN!<br>Lý do: ${u.banReason}`, '/');
        if (u.banUntil > Date.now()) {
            let left = Math.ceil((u.banUntil - Date.now())/1000);
            return renderMessage(res, `⛔ ĐANG BỊ KHÓA MÕM!<br>Mở lại sau: <b>${left} giây</b> nữa.<br>Lý do: ${u.banReason}`, '/');
        }
        u.banned = false; u.banUntil = 0; saveData(USER_FILE, users);
    }
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

// ROUTER CƠ BẢN
app.get('/', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'))));
app.get('/login', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'login.html'), 'utf-8'))));
app.get('/register', (req, res) => res.send(injectLogo(fs.readFileSync(path.join(__dirname, 'register.html'), 'utf-8'))));

app.post('/register', (req, res) => {
    const { username, password } = req.body; let users = getData(USER_FILE);
    if (users.find(u => u.username === username)) return renderMessage(res, 'Trùng tên!', '/register');
    let role = (username === 'admin') ? 'owner' : 'user';
    users.push({ username, password, role, banned: false }); saveData(USER_FILE, users);
    addUserLog(username, "Đăng ký"); renderMessage(res, `Tạo nick ${username} thành công!`, '/login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body; const users = getData(USER_FILE);
    const u = users.find(x => x.username === username && x.password === password);
    if (!u) return renderMessage(res, 'Sai thông tin!', '/login');
    req.session.user = u; addUserLog(username, "Đăng nhập"); res.redirect('/tool');
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- HỆ THỐNG AUTO KEY 3.0: CHECK VÂN TAY THIẾT BỊ (FINGERPRINT) ---

// 1. Trang Loading để quét vân tay (Gửi cho Client)
app.get('/lay-key-tu-dong', (req, res) => {
    // Trả về trang HTML chứa code JavaScript quét vân tay
    const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <title>ĐANG KIỂM TRA THIẾT BỊ...</title>
        <style>
            body { background: black; color: #0f0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: monospace; }
            .loader { border: 5px solid #333; border-top: 5px solid #0f0; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 20px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div class="loader"></div>
        <h2 id="status">ĐANG QUÉT VÂN TAY THIẾT BỊ...</h2>
        <p>Vui lòng chờ giây lát.</p>
        
        <script>
            // HÀM TẠO VÂN TAY (Dựa vào Canvas - phần cứng đồ họa)
            function getFingerprint() {
                try {
                    var canvas = document.createElement('canvas');
                    var ctx = canvas.getContext('2d');
                    var txt = "SumoTool,Browser,MachineID";
                    ctx.textBaseline = "top";
                    ctx.font = "14px 'Arial'";
                    ctx.textBaseline = "alphabetic";
                    ctx.fillStyle = "#f60";
                    ctx.fillRect(125,1,62,20);
                    ctx.fillStyle = "#069";
                    ctx.fillText(txt, 2, 15);
                    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
                    ctx.fillText(txt, 4, 17);
                    // Lấy mã hóa Base64 của hình ảnh vừa vẽ -> Đây là Fingerprint
                    return canvas.toDataURL().slice(-60); 
                } catch(e) {
                    return "Error_" + Math.random();
                }
            }

            // Gửi vân tay lên Server
            async function checkKey() {
                const fp = getFingerprint();
                document.getElementById('status').innerText = "ĐANG XỬ LÝ DỮ LIỆU...";
                
                try {
                    const response = await fetch('/api/get-key-fp', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fingerprint: fp })
                    });
                    const data = await response.json();
                    
                    // Hiển thị Key
                    document.body.innerHTML = data.html;
                } catch(e) {
                    document.getElementById('status').innerText = "Lỗi kết nối Server!";
                }
            }
            
            // Chạy ngay khi vào trang
            setTimeout(checkKey, 1000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// 2. API Xử lý Vân Tay (Server nhận mã hash)
app.post('/api/get-key-fp', (req, res) => {
    const { fingerprint } = req.body;
    const userIP = req.ip || req.connection.remoteAddress;
    let keys = getData(KEY_FILE);
    const now = Date.now();

    // Logic: Kiểm tra xem Vân Tay này HOẶC IP này đã có key chưa
    // Fingerprint mạnh hơn IP vì VPN không đổi được Fingerprint
    let existingKey = keys.find(k => 
        (k.fingerprint === fingerprint && k.expires > now) || 
        (k.ip === userIP && k.expires > now)
    );

    let keyToShow = "";

    if (existingKey) {
        keyToShow = existingKey.code;
    } else {
        const newKey = generateRandomKey();
        keys.push({ 
            code: newKey, 
            ip: userIP, 
            fingerprint: fingerprint, // Lưu lại vân tay
            created: now, 
            expires: now + 86400000, 
            usedBy: null 
        });
        saveData(KEY_FILE, keys);
        keyToShow = newKey;
    }

    // Đọc file giao diện và trả về cho JS client
    let htmlDisplay = fs.readFileSync(path.join(__dirname, 'key_display.html'), 'utf-8');
    // Chèn script copy vào HTML trả về để nút copy hoạt động
    const copyScript = `
    <script>
        function copyKey() {
            var keyText = document.getElementById("myKey").innerText;
            navigator.clipboard.writeText(keyText).then(function() {
                alert("✅ Đã COPY thành công! Quay lại nhập key nhé.");
                window.location.href = "/tool"; 
            }, function(err) { alert("Lỗi: " + err); });
        }
    </script>`;
    
    htmlDisplay = htmlDisplay.replace('{{GENERATED_KEY}}', keyToShow) + copyScript;
    
    // Trả về JSON chứa HTML
    res.json({ html: htmlDisplay });
});


// ... (CÁC PHẦN DƯỚI GIỮ NGUYÊN TỪ BẢN TRƯỚC ĐỂ ĐẢM BẢO QUYỀN ADMIN) ...

app.post('/activate-key', requireLogin, (req, res) => {
    const { key } = req.body; let keys = getData(KEY_FILE); let users = getData(USER_FILE);
    const keyData = keys.find(k => k.code === key.trim());
    if (keyData) {
        if (Date.now() > keyData.expires) return renderMessage(res, 'Key hết hạn!', '/logout');
        const uIdx = users.findIndex(u => u.username === req.session.user.username);
        users[uIdx].role = 'vip'; saveData(USER_FILE, users); keyData.usedBy = req.session.user.username; saveData(KEY_FILE, keys);
        addUserLog(req.session.user.username, `Kích hoạt KEY: ${keyData.code}`); renderMessage(res, `LÊN VIP THÀNH CÔNG!`, '/tool');
    } else { addUserLog(req.session.user.username, `Nhập sai Key: ${key}`); renderMessage(res, 'Key sai!', '/logout'); }
});

app.get('/tool', requireLogin, requireVip, (req, res) => {
    let html = fs.readFileSync(path.join(__dirname, 'tool.html'), 'utf-8'); const u = req.session.user;
    let adminBtn = (u.role === 'owner') ? '<a href="/owner" style="color:red;font-weight:bold;margin-right:10px;">👑 OWNER PANEL</a>' : '';
    let menu = VIP_LOGO + `<div style="background:#222;padding:10px 10px 10px 260px;color:#0f0;border-bottom:1px solid lime;">Hello <b>${u.username}</b> [${u.role.toUpperCase()}] | ${adminBtn} <a href="/logout" style="color:white;">Thoát</a></div>`;
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
    
    // THÊM CỘT FINGERPRINT VÀO BẢNG KEY ĐỂ EM SOI
    let keyRows = keys.map(k => `<tr><td style="color:yellow;font-weight:bold;">${k.code}</td><td><span style="font-size:10px">${k.fingerprint ? 'Máy:'+k.fingerprint.substr(0,8)+'...' : k.ip}</span></td><td style="color:${Date.now()>k.expires?'red':'lime'}">${Date.now()>k.expires?'Hết':'Còn'}</td><td>${k.usedBy||'-'}</td><td><form action="/owner/delete-key" method="POST"><input type="hidden" name="keyCode" value="${k.code}"><button style="background:red;color:white;border:none;">Xóa</button></form></td></tr>`).join('');
    
    let ulHtml = userLogs.map(l => `<div class="log-row"><span class="time">[${l.time}]</span> <span class="user">${l.user}</span>: <span class="action">${l.action}</span></div>`).join('');
    let alHtml = adminLogs.map(l => `<div class="log-row"><span class="time">[${l.time}]</span> <b style="color:red">${l.action}</b> ${l.target} (${l.detail})</div>`).join('');
    
    let uHtml = users.map(u => { 
        if(u.role==='owner') return '';
        const displayRole = u.role.toUpperCase();
        let actionBtn = !u.banned 
            ? `<form action="/owner/ban" method="POST" style="display:flex;gap:2px;align-items:center;"><input type="hidden" name="target" value="${u.username}"><input type="text" name="duration" placeholder="10s, vv" style="width:50px;background:#222;color:white;border:1px solid #555;font-size:11px;" required><button class="btn-kill" style="font-size:11px;">TRẢM</button></form>` 
            : `<form action="/owner/unban" method="POST" style="display:inline"><input type="hidden" name="target" value="${u.username}"><button class="btn-save">ÂN XÁ</button></form>`;
        
        let roleForm = `<form action="/owner/set-role" method="POST" style="display:flex;gap:5px;"><input type="hidden" name="target" value="${u.username}"><select name="newRole" style="background:black;color:cyan;border:1px solid #555;"><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="vip" ${u.role==='vip'?'selected':''}>Vip</option><option value="mod" ${u.role==='mod'?'selected':''}>Mod</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select><button class="btn-save" style="padding:0 5px;">Lưu</button></form>`;

        return `<tr><td>${u.username}</td><td>${roleForm}</td><td style="color:${u.banned?'red':'lime'}">${u.banned?'BỊ TRẢM':'SẠCH'}</td><td>${actionBtn}</td></tr>`; 
    }).join('');
    
    html = injectLogo(html);
    html = html.replace('{{KEY_COUNT}}', keys.length); html = html.replace('{{KEY_LIST}}', keyRows);
    html = html.replace('{{USER_LOGS}}', ulHtml || 'Chưa có hoạt động'); html = html.replace('{{ADMIN_LOGS}}', alHtml || 'Chưa có trảm'); html = html.replace('{{USER_LIST}}', uHtml);
    res.send(html);
});

app.post('/owner/set-role', requireLogin, requireOwner, (req, res) => { let users = getData(USER_FILE); let u = users.find(x => x.username === req.body.target); if(u) { u.role = req.body.newRole; saveData(USER_FILE, users); addAdminLog("ROLE", u.username, `Set thành ${u.role.toUpperCase()}`); } res.redirect('/owner'); });
app.post('/owner/ban', requireLogin, requireOwner, (req, res) => { let users = getData(USER_FILE); let u = users.find(x => x.username === req.body.target); if(u) { u.banned = true; u.banReason = "Admin ngứa tay"; let ms = parseDuration(req.body.duration); if (ms === -1) { u.banUntil = -1; addAdminLog("BAN", u.username, "VĨNH VIỄN"); } else { u.banUntil = Date.now() + ms; addAdminLog("BAN", u.username, `Khóa ${req.body.duration}`); } saveData(USER_FILE, users); } res.redirect('/owner'); });
app.post('/owner/unban', requireLogin, requireOwner, (req, res) => { let users = getData(USER_FILE); let u = users.find(x => x.username === req.body.target); if(u) { u.banned = false; u.banUntil = 0; saveData(USER_FILE, users); addAdminLog("UNBAN", u.username, "Mở khóa"); } res.redirect('/owner'); });

app.get('/owner/export-user-logs', requireLogin, requireOwner, (req, res) => { const logs = getData(USER_LOG_FILE); const content = logs.map(l => `[${l.time}] User: ${l.user} | Action: ${l.action}`).join('\n'); const filePath = path.join(__dirname, 'UserLogs.txt'); fs.writeFileSync(filePath, content); res.download(filePath); });
app.get('/owner/export-admin-logs', requireLogin, requireOwner, (req, res) => { const logs = getData(LOG_FILE); const content = logs.map(l => `[${l.time}] ACTION: ${l.action} | Target: ${l.target} | Detail: ${l.detail}`).join('\n'); const filePath = path.join(__dirname, 'DeathNote.txt'); fs.writeFileSync(filePath, content); res.download(filePath); });
app.post('/owner/delete-key', requireLogin, requireOwner, (req, res) => { let keys = getData(KEY_FILE); keys = keys.filter(k => k.code !== req.body.keyCode); saveData(KEY_FILE, keys); res.redirect('/owner'); });
app.post('/owner/clear-keys', requireLogin, requireOwner, (req, res) => { saveData(KEY_FILE, []); res.redirect('/owner'); });

app.listen(3000, () => console.log("System ULTIMATE FINGERPRINT running..."));