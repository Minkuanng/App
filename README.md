# CodeBot Studio

Một web app **duy nhất**: vừa là giao diện đẹp để viết/quản lý code,
vừa là server thực sự **chạy bot Node.js của bạn 24/7** — không cần
mở trình duyệt, không cần tách riêng phần "backend" và "frontend".

Bạn chỉ deploy **1 lần** lên một dịch vụ host (Railway, Render...),
sau đó mọi việc tạo bot, sửa code, bật/tắt đều làm ngay trên web.

---

## Chạy thử ở máy bạn (không bắt buộc, để xem trước)

```bash
npm install
npm start
```

Mở `http://localhost:3000`.

---

## Deploy thật (để có web chạy 24/7) — dùng Railway

1. Tạo một repo GitHub mới, đẩy toàn bộ project này lên (giữ nguyên
   cấu trúc file).
2. Vào [railway.app](https://railway.app) → **New Project** → **Deploy
   from GitHub repo** → chọn repo vừa tạo.
3. Railway tự nhận ra đây là project Node.js, tự chạy `npm install`
   rồi `npm start`. Không cần thêm biến môi trường nào — vậy là xong.
4. Vào tab **Settings → Networking** bấm **Generate Domain** để có
   một đường link public, ví dụ `https://ten-app.up.railway.app`.
5. Mở link đó — đây chính là web của bạn, chạy 24/7.

> Dùng **Render** thì tương tự: **New → Web Service**, trỏ tới repo,
> Build Command: `npm install`, Start Command: `npm start`.

---

## Cách dùng

1. Bấm **+** ở sidebar để tạo bot mới, đặt tên.
2. Viết code Node.js bình thường trong khung soạn — `require()`,
   `fetch`, package npm đều dùng được vì code chạy bằng Node thật
   trên server, không phải giả lập trong trình duyệt.
3. Bấm **Lưu** (hoặc Ctrl/Cmd+S).
4. Bấm **Bật chạy 24/7** — bot khởi động ngay, log hiện trực tiếp ở
   khung Console bên phải.
5. Sửa code và Lưu khi bot đang chạy → bot tự khởi động lại với code
   mới, không cần tắt thủ công.
6. Tắt trình duyệt, tắt máy của bạn — bot vẫn tiếp tục chạy trên
   server, vì server là nơi đang giữ cho nó sống, không phải máy bạn.

---

## Nếu bot cần package npm ngoài (discord.js, axios, ...)

Mở terminal trong repo, chạy:

```bash
npm install discord.js
```

rồi commit + push `package.json` đã cập nhật lên GitHub. Railway/Render
sẽ tự cài lại khi deploy. Vì tất cả bot chạy chung 1 server Node, mọi
package cài vào project này dùng được cho tất cả bot.

---

## Lưu trữ dữ liệu

Code và log của từng bot được lưu trong file `data/db.json` ngay
trên server — không cần thiết lập database ngoài. Lưu ý: trên một số
dịch vụ free tier, ổ đĩa có thể bị xoá khi server khởi động lại sau
thời gian dài không hoạt động. Nếu cần lưu trữ bền vững lâu dài, có
thể nâng cấp lên gắn thêm volume/persistent disk của Railway/Render
(cấu hình trong dashboard, không cần sửa code).

