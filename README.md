# Reader Studio 2.0.2 — Google Drive Edition

## Cập nhật 2.0.2

- Mỗi note tạo trong Ghi chú chung hoặc notebook theo sách có nút × để xóa riêng.
- Quote yêu thích được chia trang: 6 quote mỗi trang trên desktop và 4 quote mỗi trang trên điện thoại.
- Giao diện Ghi chú chung trên điện thoại được sắp xếp lại, không còn chồng nút; danh sách sách và thanh định dạng cuộn ngang.
- Ngăn lần xác định vị trí đầu tiên của EPUB ghi nhầm sách mới là đã hoàn thành.
- Thêm nút Đặt lại trạng thái đọc trong Tùy chỉnh sách để sửa tiến độ và lịch sử hoàn thành bị ghi nhầm.

Reader Studio là web đọc PDF/EPUB theo hướng local-first. Bản 2.0 thay Supabase bằng Google Drive + Google Sheets để tránh giới hạn egress của dịch vụ cũ:

- **Google Drive** lưu PDF, EPUB và ảnh bìa.
- **Google Sheets** lưu danh mục sách, tiến độ, highlight, note, bookmark, notebook và thiết lập thư viện.
- **IndexedDB trên từng thiết bị** giữ bản cache để mở nhanh và tiếp tục đọc khi ngoại tuyến.
- File sách chỉ tải về thiết bị mới khi bạn mở lần đầu; sau đó bản local được dùng lại.

Ứng dụng chỉ truy cập thư mục và spreadsheet do chính Reader Studio tạo trong Drive. Không cần database server, Apps Script hay API key bí mật.

## 1. Chạy local

1. Giải nén thư mục.
2. Double-click `start.bat` trên Windows, hoặc chạy `./start.sh` trên macOS/Linux.
3. Mở `http://localhost:4173`.

Bạn có thể dùng toàn bộ chức năng local mà chưa cần cấu hình Google.

## 2. Tạo Google OAuth Client ID

Thao tác một lần trong [Google Cloud Console](https://console.cloud.google.com/):

1. Tạo hoặc chọn một project.
2. Vào **APIs & Services → Library**, bật Google Drive API và Google Sheets API.
3. Vào **Google Auth Platform → Branding** và tạo màn hình đồng ý OAuth.
4. Nếu ứng dụng đang ở chế độ Testing, thêm email Google của bạn vào **Test users**.
5. Vào **Clients → Create client → Web application**.
6. Thêm các **Authorized JavaScript origins**:
   - `http://localhost:4173`
   - origin GitHub Pages, ví dụ `https://rubbieduckie2k1-max.github.io`
7. Không cần thêm redirect URI cho kiểu token popup này.
8. Copy Client ID có đuôi `.apps.googleusercontent.com`.

JavaScript origin chỉ gồm giao thức + tên miền + port, không có đường dẫn `/reader-studio/` ở cuối.

## 3. Tạo `config.js`

Copy `config.example.js`, đổi tên thành `config.js`, rồi điền Client ID:

```js
window.READER_STUDIO_CONFIG = {
  googleClientId: 'YOUR_CLIENT_ID.apps.googleusercontent.com'
};
```

OAuth Client ID là mã public dành cho web, có thể nằm trong GitHub Pages. Không đặt Client Secret, mật khẩu Google, service-account key hoặc refresh token vào repository.

## 4. Kết nối và chuyển dữ liệu cũ

Thực hiện trước trên đúng trình duyệt/máy tính đang chứa thư viện Reader Studio cũ:

1. Chép bộ file 2.0 vào repository hoặc thư mục chạy local, nhưng **không xóa Site Data/IndexedDB**.
2. Mở Reader Studio ở đúng URL cũ.
3. Bấm **Kết nối Google** và chấp thuận quyền Drive + Sheets.
4. Reader Studio tự tạo trong My Drive: `Reader Studio/Books`, `Reader Studio/Covers` và `Reader Studio/Reader Studio Database`.
5. Trong cửa sổ tài khoản, bấm **Chuyển dữ liệu lên Google**.
6. Giữ trang mở đến khi báo **Đã đồng bộ**. Với nhiều PDF/EPUB lớn, lần đầu có thể mất vài phút.

Quá trình chuyển là copy: dữ liệu IndexedDB cũ không bị xóa. Bản 2.0 tìm cả database local mặc định và cache tài khoản Supabase 1.x trên thiết bị để chuyển sang Google.

## 5. Cập nhật GitHub Pages

Upload các file sau vào root repository và thay file cũ:

- `index.html`
- `app.js`
- `styles.css`
- `service-worker.js`
- `manifest.webmanifest`
- `vendor/`
- `config.js` của bạn

Sau khi GitHub Pages cập nhật, mở site trên điện thoại, bấm **Kết nối Google** bằng cùng tài khoản rồi **Đồng bộ ngay**. Danh mục và ảnh bìa được lấy từ Google; PDF/EPUB được tải khi mở cuốn sách lần đầu.

Nếu vẫn thấy giao diện cũ, đóng toàn bộ tab Reader Studio rồi mở lại hoặc tải lại trang hai lần để service worker 2.0 nhận bản mới.

## 6. Cách đồng bộ hoạt động

- Mọi thay đổi được lưu trên thiết bị trước.
- Khi đã kết nối Google, thay đổi được xếp hàng và đẩy lên Sheets theo từng record; ứng dụng không tải lại toàn bộ file sách.
- Ứng dụng đọc ô `revision` nhỏ trong Sheet trước. Chỉ khi revision thay đổi mới tải bảng metadata đầy đủ.
- File PDF/EPUB và bìa chỉ upload khi chưa có hoặc khi bìa thực sự thay đổi.
- Không tự đồng bộ mỗi lần chuyển tab trình duyệt; dùng hàng đợi sau khi sửa và nút **Đồng bộ ngay** để giảm request.
- Xung đột dùng nguyên tắc bản có `updatedAt` mới hơn thắng.
- Access token Google có thời hạn. Khi phiên hết hạn, bấm **Kết nối Google** lại; dữ liệu local vẫn nguyên vẹn.

## 7. Sao lưu và phục hồi

Toàn bộ bản cloud nằm trong thư mục `Reader Studio` ở My Drive. Bạn có thể tải thư mục về để sao lưu file sách và dùng Version history của Google Sheets để phục hồi bảng.

Không tự đổi tên tab `META` và `RECORDS`, không xóa cột hoặc sửa JSON trong các cột `data_*` nếu không có bản sao lưu.

## 8. Chức năng chính

- PDF/EPUB reader, mục lục, tìm kiếm, bookmark, resume reading và nhập số trang.
- Zoom, fit width, chế độ một/hai trang; điều hướng hai trang không bỏ qua trang cuối chương.
- Highlight ổn định khi đổi zoom/kích thước, underline, strike, note và dịch nhanh.
- Reading Notebook theo từng sách và khu ghi chú chung.
- Quote yêu thích và Quote of the Day có chế độ thu gọn.
- Status sách phân trang, lọc đúng Đã đọc / Đang đọc / Chưa đọc và giữ số lượt hoàn thành.
- Ghim tối đa hai sách, hiển thị dạng carousel trên desktop và mobile.
- Thể loại, series/bộ truyện, xóa/đổi tên, sắp thứ tự phần.
- Thư viện 4/5/6 bìa mỗi hàng trên desktop; bố cục mobile riêng.
- Dark mode, PWA và cache offline.

## 9. Quyền riêng tư

Reader Studio chạy trực tiếp trong trình duyệt. Dữ liệu đọc được lưu vào Google Drive/Sheets của tài khoản bạn chọn. Ứng dụng không có server trung gian và không nhận mật khẩu Google.

Tính năng dịch nhanh dùng MyMemory; chỉ đoạn chữ bạn chủ động bấm dịch mới được gửi đến dịch vụ đó.

## 10. Xử lý lỗi nhanh

- **Error 400: origin_mismatch**: thêm đúng origin hiện tại vào Authorized JavaScript origins.
- **Access blocked / app in testing**: thêm email đang dùng vào Test users.
- **Google Drive API has not been used**: bật Drive API và Sheets API, đợi vài phút rồi thử lại.
- **Phiên Google đã hết hạn**: ngắt kết nối và kết nối lại.
- **Điện thoại không thấy sách**: kiểm tra đúng tài khoản Google, bấm Đồng bộ ngay và không dùng trình duyệt private/incognito.
- **Upload chưa xong**: giữ tab mở, kiểm tra mạng và dung lượng Drive; bấm Đồng bộ ngay lần nữa. Hàng đợi local sẽ tiếp tục từ mục chưa xong.

## Phím tắt

- `←` / `→`: trang trước / sau
- `H`: highlight đoạn đang chọn
- `N`: tạo note
- `B`: bookmark
- `Ctrl + F`: tìm trong sách
- `Esc`: đóng popup
