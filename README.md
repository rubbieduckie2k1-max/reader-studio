# Reader Studio 1.2.0

Web đọc sách local-first dành cho PDF và EPUB, có thể đồng bộ riêng tư giữa máy tính và điện thoại bằng Supabase.

## Cách chạy trên Windows

1. Giải nén thư mục.
2. Double-click `start.bat`.
3. Trình duyệt sẽ mở `http://localhost:4173`.
4. Bấm **Thêm sách** và chọn PDF/EPUB.

Không cần cài Python hay phần mềm bổ sung. Reader Studio dùng PowerShell có sẵn trên Windows để chạy. Hãy giữ cửa sổ `Reader Studio` mở trong lúc đọc sách; nhấn `Ctrl+C` hoặc đóng cửa sổ đó để dừng.

## Thiết lập đồng bộ máy tính ↔ điện thoại

Không cần kết nối Supabase cá nhân với tài khoản ChatGPT. Bạn chỉ thao tác trong tài khoản Supabase và GitHub cá nhân của mình.

### Bước 1 — Tạo database và vùng lưu sách

1. Mở project Supabase cá nhân.
2. Vào **SQL Editor** → **New query**.
3. Mở file `supabase-schema.sql` trong gói Reader Studio, copy toàn bộ nội dung và dán vào SQL Editor.
4. Bấm **Run**. Chỉ cần chạy file này một lần.

File SQL bật Row Level Security: người dùng chỉ được đọc và sửa dữ liệu thuộc đúng tài khoản của mình.

### Bước 2 — Cấu hình đăng nhập

1. Trong Supabase, mở **Authentication → URL Configuration**.
2. Đặt **Site URL** thành:

   `https://rubbieduckie2k1-max.github.io/reader-studio/`

3. Trong **Redirect URLs**, thêm hai địa chỉ:

   - `https://rubbieduckie2k1-max.github.io/reader-studio/`
   - `http://localhost:4173/`

4. Đảm bảo đăng nhập bằng **Email** đang được bật trong **Authentication → Providers**.

### Bước 3 — Điền thông tin public vào `config.js`

1. Trong Supabase, mở khu vực **Project Settings / API Keys**.
2. Copy **Project URL**.
3. Copy **Publishable key**. Nếu giao diện cũ chưa có Publishable key, dùng `anon public` key.
4. Mở `config.js` bằng Notepad và điền:

```js
window.READER_STUDIO_CONFIG = {
  supabaseUrl: 'https://PROJECT_ID.supabase.co',
  supabasePublishableKey: 'YOUR_PUBLISHABLE_KEY'
};
```

`Project URL` và Publishable/anon key được dùng công khai trong ứng dụng web. Tuyệt đối không điền database password, `service_role` key hoặc secret key vào file này.

### Bước 4 — Chuyển dữ liệu cũ lên cloud một lần

Thực hiện trên đúng máy tính và đúng địa chỉ đang chứa sách/ghi chú cũ:

1. Chép các file của bản 1.2.0 vào thư mục Reader Studio local cũ. Không xóa dữ liệu trình duyệt.
2. Chạy `start.bat` và mở `http://localhost:4173`.
3. Bấm **Đăng nhập** → tạo/đăng nhập bằng email cá nhân.
4. Bấm **Đồng bộ dữ liệu hiện có**.
5. Giữ trang mở cho đến khi trạng thái báo **Đã đồng bộ**.

Dữ liệu local cũ vẫn được giữ nguyên làm bản an toàn. Việc chuyển chỉ copy dữ liệu vào tài khoản, không xóa bản cũ.

### Bước 5 — Cập nhật GitHub Pages và dùng trên điện thoại

1. Upload toàn bộ nội dung của thư mục Reader Studio 1.2.0 vào root của repository GitHub, gồm cả `vendor/jszip.min.js` và `config.js` đã điền.
2. Commit và chờ GitHub Pages cập nhật.
3. Mở `https://rubbieduckie2k1-max.github.io/reader-studio/` trên điện thoại.
4. Đăng nhập bằng đúng email cá nhân ở bước 4.

Danh sách sách và ghi chú sẽ tải xuống. File PDF/EPUB chỉ tải về điện thoại khi mở lần đầu; sau đó có thể đọc bản đã tải khi mất mạng.

Để mở giống một ứng dụng:

- Android/Chrome: menu `⋮` → **Thêm vào màn hình chính** hoặc **Cài đặt ứng dụng**.
- iPhone/Safari: nút **Chia sẻ** → **Thêm vào Màn hình chính**.

## Cơ chế đồng bộ

- Mọi thay đổi được lưu vào thiết bị trước, sau đó tự đồng bộ khi có Internet.
- Khi ngoại tuyến, thay đổi được xếp hàng và gửi lên khi mạng trở lại.
- Có nút **Đồng bộ ngay** trong phần **Tài khoản**.
- Mỗi tài khoản có kho cache riêng trên thiết bị; tài khoản khác không thấy dữ liệu của nhau.
- Nếu cùng sửa một notebook trên hai thiết bị khi đều ngoại tuyến, bản lưu sau cùng sẽ được giữ.

## Chức năng

- Library: PDF/EPUB, cover, tên sách, tác giả, tiến độ đọc.
- PDF reader: fit width, zoom, 1 trang / 2 trang, fullscreen.
- EPUB reader: paginated reader, tăng/giảm cỡ chữ, 1/2 trang.
- Highlight 4 màu, underline, strike marker.
- Click vào đoạn đã đánh dấu để sửa note hoặc xóa highlight/underline.
- Reader tự dàn lại trang khi mở hoặc đóng mục lục và bảng ghi chú.
- Highlight và underline EPUB được khôi phục trực tiếp trên trang khi mở lại sách.
- Dùng **Lưu chỗ** để ghi nhớ vị trí đang đọc và nút **↩** để quay lại ngay.
- Note gắn vào đoạn được chọn.
- Bookmark, TOC, tìm kiếm trong sách.
- Notes/Highlights panel và click để quay lại vị trí gốc.
- Resume reading và % tiến độ.
- Dark mode và phím tắt.
- Reading Notebook cho phép gõ trực tiếp, đổi Heading về văn bản thường, chỉnh màu chữ, màu nền chữ, bold, italic, underline và chèn highlight/note.
- Notebook tổng ở ngoài thư viện để mở và chỉnh notebook của mọi cuốn sách tại một nơi.
- Quét chữ -> **Dịch** -> chỉ hiện bản dịch ngắn gọn; có thể thêm vào Notebook.

## Phím tắt

- `←` / `→`: trang trước / trang sau
- `H`: highlight vàng đoạn đang chọn
- `N`: tạo note cho đoạn đang chọn
- `B`: bookmark
- `Ctrl + F`: tìm trong sách
- `Esc`: đóng popup/toolbar

## Lưu dữ liệu

Khi chưa cấu hình/đăng nhập, sách, annotation, notebook và tiến độ chỉ được lưu trong **IndexedDB của trình duyệt**.

Khi đăng nhập, dữ liệu được lưu local-first và đồng bộ vào project Supabase cá nhân. Bucket sách là private và Row Level Security giới hạn dữ liệu theo tài khoản đăng nhập.

Không xóa Site Data/Browser Data của `localhost:4173` nếu muốn giữ thư viện hiện tại.

## Dịch nhanh

Dịch nhanh mặc định dùng MyMemory. Chỉ đoạn chữ bạn bấm **Dịch** mới được gửi tới dịch vụ dịch. Có thể đổi hướng English ↔ Vietnamese trong Settings. Tính năng này cần Internet.

## Ghi chú kỹ thuật

- PDF có text layer: highlight/search/translate hoạt động trực tiếp.
- PDF scan chỉ gồm ảnh chưa có OCR tích hợp trong bản này, nên không thể quét chữ cho đến khi file có text layer.
- EPUB strike được hiển thị bằng một marker đỏ nhẹ để giữ vị trí ổn định trên EPUB reflow.
- PDF.js và EPUB.js được tải động từ CDN khi cần; vì vậy lần đầu mở từng định dạng cần Internet.
