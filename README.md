# 🎮 Cờ Caro Online (XO Realtime Multiplayer)

Ứng dụng Game Cờ Caro (XO) Online 2 người chơi qua Link thực thời (Realtime). Bạn chỉ cần tạo phòng, **sao chép link gửi cho bạn bè** là 2 người vào cùng 1 link có thể đấu cờ caro trực tiếp với nhau!

---

## ✨ Tính năng nổi bật

- 🔗 **Kết nối 2 người qua Link**: Chia sẻ link phòng `?room=CODE` để bạn bè vào chơi trực tiếp mà không cần đăng ký tài khoản.
- ⚡ **Đồng bộ Realtime**: Sử dụng Socket.io giúp nước đi đồng bộ tức thì, mượt mà.
- 🏆 **Luật chơi chuẩn Caro Gomoku**:
  - Hỗ trợ bàn cờ **15x15** (Chuẩn), **20x20**, hoặc **3x3** (XO Cổ điển).
  - Thắng khi có 5 quân liên tiếp (ngang, dọc, chéo).
  - Tùy chọn bật/tắt **Luật chặn 2 đầu không tính thắng**.
- ⏱️ **Đếm ngược thời gian nước đi**: 30 giây cho mỗi lượt đi với thanh progress bar trực quan.
- 💬 **Trò chuyện & Xem Lịch Sử Nước Đi**: Tích hợp ô chat trực tiếp trong phòng chơi và xem danh sách các nước đi đã đánh.
- 🎨 **Giao diện Cyberpunk Neon đẳng cấp**: Thiết kế Dark Mode sang trọng, hiệu ứng Glow neon sống động, pháo hoa mừng chiến thắng.
- 🔊 **Âm thanh tổng hợp (Web Audio API)**: Tiếng đánh cờ, thắng, thua, âm thanh thông báo sinh động.

---

## 🚀 Hướng dẫn chạy trên máy local

### 1. Cài đặt thư viện
Mở terminal trong thư mục dự án và chạy:
```bash
cmd /c npm install
```

### 2. Khởi chạy Server
```bash
cmd /c npm start
```
Server sẽ chạy tại địa chỉ: **`http://localhost:3000`**

### 3. Trải nghiệm thử 2 người chơi
1. Mở trình duyệt và truy cập `http://localhost:3000`.
2. Bấm **VÀO PHÒNG CHƠI NGAY**.
3. Bấm **Sao chép Link mời** ở góc trên màn hình.
4. Mở thêm 1 tab ẩn danh (Incognito) hoặc trình duyệt khác, dán Link vừa sao chép vào.
5. Hai tab sẽ tự động kết nối vào cùng 1 bàn cờ và bạn có thể bắt đầu đấu cờ Caro!

---

## 🌐 Hướng dẫn Deploy lên Web miễn phí

### Cách 1: Deploy Render.com (Tốt nhất cho Node.js + Socket.io)
1. Đưa code này lên repository GitHub của bạn.
2. Truy cập [Render.com](https://render.com) -> Chọn **New Web Service**.
3. Kết nối với repo GitHub của bạn.
4. Đặt cấu hình:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Bấm **Create Web Service**. Sau khi deploy xong, bạn sẽ có link web dạng `https://caro-online.onrender.com` để gửi cho bạn bè toàn thế giới!

---

## 📁 Cấu trúc thư mục

```
Caro Online/
├── server.js          # Node.js Express + Socket.io Server Backend
├── package.json       # Cấu hình dự án và dependencies
├── README.md          # Hướng dẫn chi tiết
└── public/            # Giao diện Frontend Web
    ├── index.html     # Giao diện trang web game
    ├── style.css      # CSS styling & hiệu ứng animation
    └── app.js         # Logic game client, kết nối socket & âm thanh
```
