const express = require('express');
const multer = require('multer'); // Thư viện nhận file upload
const { exec } = require('child_process'); // Thư viện chạy lệnh CMD
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const app = express();

// Cấu hình nơi lưu file upload tạm thời
const upload = multer({ dest: 'uploads/' });

app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// --- 1. TRANG ĐĂNG NHẬP ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// --- 2. XỬ LÝ ĐĂNG NHẬP ---
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === "admin" && password === "123456") {
        res.sendFile(path.join(__dirname, 'tool.html'));
    } else {
        res.send('<h1>SAI MẬT KHẨU! <a href="/">Quay lại</a></h1>');
    }
});

// --- 3. XỬ LÝ CONVERT VIDEO (PHẦN QUAN TRỌNG NHẤT) ---
// upload.single('video'): Nhận 1 file từ ô có name="video" bên HTML
app.post('/upload', upload.single('video'), (req, res) => {
    
    // Nếu không có file thì báo lỗi
    if (!req.file) {
        return res.send('Chưa chọn file video!');
    }

    const inputPath = req.file.path; // Đường dẫn file gốc vừa up lên
    const outputName = `video_da_convert_${Date.now()}.3gp`; // Tên file đầu ra (thêm giờ để không trùng)
    const outputPath = path.join(__dirname, outputName);

    // LẤY CÔNG THỨC FFmpeg CỦA MINH
    // Lưu ý: Anh dùng "ffmpeg.exe" (giả sử em đã copy nó vào cùng thư mục)
    // Nếu em cài ffmpeg vào máy rồi thì chỉ cần ghi "ffmpeg" là được.
    
    // Lệnh Convert chuẩn cho Sumo T2 (Code gốc của em)
   // Dùng biến ffmpegPath thay vì chữ "ffmpeg" cứng
const command = `"${ffmpegPath}" -i "${inputPath}" -vcodec mpeg4 -acodec libopencore_amrnb -ac 1 -ar 8000 -s 176x144 -r 15 -y "${outputPath}"`;

    console.log("Đang xử lý: " + command);

    // Bắt đầu chạy lệnh CMD ngầm
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Lỗi: ${error}`);
            return res.send(`<h1>Lỗi khi convert: ${error.message}</h1>`);
        }

        // Convert xong -> Tải file về cho người dùng
        res.download(outputPath, (err) => {
            if (err) console.log("Lỗi tải file:", err);
            
            // Dọn dẹp: Xóa file tạm đi cho nhẹ server
            fs.unlinkSync(inputPath); 
            // fs.unlinkSync(outputPath); // Muốn giữ file kết quả thì comment dòng này lại
        });
    });
});

app.listen(3000, () => {
    console.log("Server đang chạy: http://localhost:3000");
});