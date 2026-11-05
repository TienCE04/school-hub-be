# school-hub

## Chạy backend để app dùng qua Wi-Fi

1. Khởi động PostgreSQL và Redis theo cấu hình dự án.
2. Chạy backend bằng `npm run dev` (hoặc `npm start`). Mặc định server lắng nghe trên `0.0.0.0:3000` để thiết bị trong cùng mạng LAN truy cập. Có thể đổi bằng biến `HOST` và `PORT`.
3. Trên máy Windows chạy backend, dùng `ipconfig` để tìm địa chỉ IPv4 của card Wi-Fi, ví dụ `192.168.1.20`.
4. Điện thoại và máy tính chạy backend cần ở cùng mạng LAN (máy tính có thể dùng Ethernet, điện thoại dùng Wi-Fi). App Android phải được build với URL `http://192.168.1.20:3000` (xem hướng dẫn trong README của app).

Nếu điện thoại không kết nối được, kiểm tra Windows Firewall cho phép Node.js nhận kết nối trên cổng TCP 3000 trong mạng Private. Không mở cổng này ra Internet.

Sao chép `.env.example` thành `.env` và điền các biến môi trường cần thiết. `HOST=0.0.0.0` và `PORT=3000` là cấu hình mặc định cho truy cập qua Wi-Fi.
