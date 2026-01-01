// Tìm cái nút trong web và đặt tên biến là 'nutBam'
var nutBam = document.querySelector('button');

// Lập trình: Khi nút được click chuột
nutBam.addEventListener('click', function() {
    
    // 1. Tạo 3 số màu ngẫu nhiên (Red, Green, Blue)
    var r = Math.floor(Math.random() * 255);
    var g = Math.floor(Math.random() * 255);
    var b = Math.floor(Math.random() * 255);

    // 2. Đổi màu nền của cả trang web (body)
    document.body.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    // 3. Hiện thông báo trêu
    // alert('Đã đổi màu rồi nha!');
});