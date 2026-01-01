const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'users.json');

// --- HÀM HỖ TRỢ HIỂN THỊ THÔNG BÁO ĐẸP ---
function renderMessage(res, message, linkObj) {
    let template = fs.readFileSync(path.join(__dirname, 'message.html'), 'utf-8');
    template = template.replace('REPLACE_MESSAGE', message);
    template = template.replace('REPLACE_LINK', linkObj);
    res.send(template);
}

// Hàm đọc user
function getUsers() {
    if (!fs.existsSync(DATA_FILE)) return []; // Nếu chưa có file thì trả về rỗng
    try {
        const data = fs.readFileSync(DATA_FILE);
        return JSON.parse(data);
    } catch (e) { return []; }
}

// Hàm lưu user
function saveUser(username, password) {
    const users = getUsers();
    if (users.find(u => u.username === username)) return false; // Trùng tên
    users.push({ username, password });
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
    return true;
}

// --- ROUTER ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ĐĂNG KÝ
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    
    // Logic tạo ADMIN: Ai nhanh tay đăng ký tên 'admin' trước thì được làm admin
    if (saveUser(username, password)) {
        // Thay vì alert phèn, ta dùng giao diện đẹp
        renderMessage(res, `Đăng ký thành công tài khoản <b>${username}</b>!`, '/login');
    } else {
        renderMessage(res, `Tên tài khoản <b>${username}</b> đã tồn tại! Vui lòng chọn tên khác.`, '/register');
    }
});

// ĐĂNG NHẬP
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    
    // Kiểm tra tài khoản
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        res.sendFile(path.join(__dirname, 'tool.html'));
    } else {
        // Lỗi đăng nhập giờ cũng hiện đẹp luôn, không trắng tinh nữa
        renderMessage(res, 'Sai tên tài khoản hoặc mật khẩu!', '/login');
    }
});

// CONVERT VIDEO (Giữ nguyên)
app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) return renderMessage(res, 'Vui lòng chọn file video!', '/tool.html');

    const inputPath = req.file.path;
    const outputName = `video_${Date.now()}.3gp`;
    const outputPath = path.join(__dirname, outputName);

    // Lệnh Convert
    const command = `"${ffmpegPath}" -i "${inputPath}" -vcodec mpeg4 -acodec libopencore_amrnb -ac 1 -ar 8000 -s 176x144 -r 15 -y "${outputPath}"`;

    console.log("Đang xử lý: " + command);

    exec(command, (error) => {
        if (error) return renderMessage(res, 'Lỗi convert: ' + error.message, '/tool.html');
        
        res.download(outputPath, () => {
            fs.unlinkSync(inputPath); 
        });
    });
});

app.listen(3000, () => {
    console.log("Server running...");
});