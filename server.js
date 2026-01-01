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

// --- CÁC HÀM XỬ LÝ DATABASE (users.json) ---
const DATA_FILE = path.join(__dirname, 'users.json');

// Hàm đọc danh sách user
function getUsers() {
    if (!fs.existsSync(DATA_FILE)) return [];
    const data = fs.readFileSync(DATA_FILE);
    return JSON.parse(data);
}

// Hàm lưu user mới
function saveUser(username, password) {
    const users = getUsers();
    // Kiểm tra xem trùng tên không
    if (users.find(u => u.username === username)) return false;
    
    users.push({ username, password });
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
    return true;
}

// --- ĐỊNH TUYẾN (ROUTER) ---

// 1. TRANG CHỦ (Landing Page)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. TRANG ĐĂNG KÝ
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (saveUser(username, password)) {
        res.send(`<script>alert("Đăng ký thành công! Hãy đăng nhập."); window.location.href="/login";</script>`);
    } else {
        res.send(`<script>alert("Tên này có người dùng rồi!"); window.history.back();</script>`);
    }
});

// 3. TRANG ĐĂNG NHẬP
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    
    // Tìm trong danh sách users xem có ai khớp không
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        res.sendFile(path.join(__dirname, 'tool.html'));
    } else {
        res.send('<h1>SAI TÀI KHOẢN HOẶC MẬT KHẨU! <a href="/login">Thử lại</a></h1>');
    }
});

// 4. XỬ LÝ CONVERT VIDEO
app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) return res.send('Chưa chọn file!');

    const inputPath = req.file.path;
    const outputName = `video_${Date.now()}.3gp`;
    const outputPath = path.join(__dirname, outputName);

    // Lệnh Convert chuẩn cho máy cỏ
    const command = `"${ffmpegPath}" -i "${inputPath}" -vcodec mpeg4 -acodec libopencore_amrnb -ac 1 -ar 8000 -s 176x144 -r 15 -y "${outputPath}"`;

    console.log("Processing: " + command);

    exec(command, (error) => {
        if (error) return res.send(`Lỗi: ${error.message}`);
        res.download(outputPath, () => {
            fs.unlinkSync(inputPath); // Xóa file gốc
            // fs.unlinkSync(outputPath); // Giữ file kết quả (hoặc xóa tùy ý)
        });
    });
});

app.listen(3000, () => {
    console.log("Server ProMax running at http://localhost:3000");
});