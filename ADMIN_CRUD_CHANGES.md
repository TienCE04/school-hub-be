# Admin CRUD – Backend Change Summary

Tài liệu này tổng hợp các thay đổi backend phục vụ CRUD Admin cho School Hub.

## 1. Phạm vi

Đã hoàn thiện các nhóm chức năng:

- Quản lý tài khoản người dùng.
- Quản lý lớp học.
- Quản lý học kỳ.
- Quản lý môn học/lịch học trong học kỳ.

Các chức năng dùng lại schema Prisma hiện có, không thêm migration mới riêng cho CRUD Admin.

## 2. Quyền truy cập

Tất cả endpoint bên dưới đều yêu cầu Bearer token.

| Nhóm | Endpoint | Quyền |
|---|---|---|
| Users | `/api/users`, `/api/users/:id` | `ADMIN` |
| Semesters | `/api/schedule/semesters/:id` | `ADMIN` |
| Subjects | `/api/schedule/semesters/:semesterId/subjects` | `ADMIN` |
| Classes – list/manage | `/api/classes/admin/all`, `DELETE /api/classes/:id`, `/members/manage` | `ADMIN` |
| Classes – update | `PUT /api/classes/:id` | `ADMIN`, `TEACHER` |

Teacher khi sửa lớp vẫn phải là thành viên có role `TEACHER` của lớp đó. Admin được bypass kiểm tra thành viên.

## 3. Users API

### Endpoint

```http
GET    /api/users?page=1&limit=20&role=STUDENT&search=nguyen
POST   /api/users
GET    /api/users/:id
PUT    /api/users/:id
POST   /api/users/:id/reset-password
DELETE /api/users/:id
```

`GET /api/users` trả về:

```json
{
  "users": [],
  "total": 0,
  "page": 1,
  "limit": 20,
  "totalPages": 0
}
```

Query hỗ trợ:

- `page`: mặc định `1`.
- `limit`: mặc định `20`, tối đa `100`.
- `role`: `ADMIN`, `TEACHER`, `STUDENT`.
- `search`: tìm theo `name`, `email`, `studentCode`.

### Body mẫu

Admin tạo tài khoản bằng `POST /api/users`; hồ sơ sinh viên gửi cùng payload:

```json
{
  "name": "Nguyen Van A",
  "email": "a@example.edu.vn",
  "password": "minimum-6-chars",
  "role": "STUDENT",
  "studentCode": "SV001",
  "profile": {
    "phone": "0900000000",
    "birthDate": "2005-01-01",
    "emailPersonal": "a.personal@example.com",
    "nameSchool": "School of Computing",
    "nameClass": "K70-IT1",
    "major": "Computer Science",
    "department": "Information Technology",
    "title": "",
    "story": ""
  }
}
```

`PUT /api/users/:id` cũng nhận object `profile`; API list/detail trả các trường hồ sơ này cùng tài khoản.

```json
PUT /api/users/12
{
  "name": "Nguyen Van A",
  "email": "a@example.com",
  "role": "STUDENT",
  "studentCode": "20260001"
}
```

```json
POST /api/users/12/reset-password
{
  "newPassword": "new-password-123"
}
```

### Quy tắc nghiệp vụ

- Mật khẩu reset phải có tối thiểu 6 ký tự.
- Student bắt buộc có `studentCode`.
- Đổi role khỏi `STUDENT` sẽ xóa `studentCode`.
- Admin không thể tự hạ role của mình hoặc tự xóa tài khoản.
- Không thể xóa admin cuối cùng trong hệ thống.
- Xóa user là hard delete; nếu user đang được tham chiếu bởi dữ liệu lịch sử, database constraint có thể từ chối thao tác.

### Thay đổi liên quan

- `register.dto.js` hiện nhận `studentCode` và normalize `name/email`.
- Route FCM được đặt trước route động `/:id` để `DELETE /api/users/fcm-token` không bị bắt nhầm vào delete user.
- Đã loại bỏ log request login chứa dữ liệu nhạy cảm.

## 4. Classes API

### Endpoint

```http
GET    /api/classes/admin/all?page=1&limit=20&search=math
GET    /api/classes/:id/members/manage?page=1&limit=12&search=nguyen
GET    /api/classes/:id/members/candidates?search=SV001
GET    /api/classes/:classCode/members/page?page=1&limit=20&search=nguyen
PUT    /api/classes/:id
DELETE /api/classes/:id
POST   /api/classes/:id/members/manage
```

`GET /api/classes/admin/all` trả về danh sách có:

- Thông tin lớp: `id`, `name`, `description`, `code`.
- Danh sách giảng viên (`members`); sinh viên được lấy riêng theo trang khi mở quản lý thành viên.
- `membersCount` (toàn bộ thành viên), `postsCount`.
- Subject đang liên kết nếu có.
- Thông tin phân trang.

`GET /api/classes/:id/members/manage` trả `members`, `total`, `page`, `limit`, `totalPages`; tìm theo tên, email, mã SV, giới hạn tối đa 50 người/trang. `GET /api/classes/:id/members/candidates` nhận từ khóa ít nhất 2 ký tự và trả tối đa 15 sinh viên chưa ở lớp.

Tab thành viên trong chi tiết lớp dùng `GET /api/classes/:classCode/members/page`, trả `teachers` và `students` theo trang (tối đa 50 sinh viên/trang), cùng `total` và `totalPages`. Endpoint `/members` cũ vẫn trả mảng đầy đủ cho client đang dùng nó.

### Body cập nhật lớp

```json
PUT /api/classes/10
{
  "name": "Software Engineering - A",
  "description": "Updated description",
  "code": "SE-A-2026",
  "teacherId": 25
}
```

`teacherId: null` dùng để bỏ toàn bộ giảng viên phụ trách.

### Body quản lý member

Có thể dùng dạng một member:

```json
POST /api/classes/10/members/manage
{
  "action": "add",
  "userId": 31
}
```

POST trả về `addedCount` và `removedCount`; Admin tải lại trang thành viên sau thao tác.

Hoặc dùng batch:

```json
POST /api/classes/10/members/manage
{
  "addUserIds": [31, 32],
  "removeUserIds": [33]
}
```

### Quy tắc xóa lớp

- Xóa member và join request theo quan hệ cascade của schema.
- Dọn post, comment, submission và attachment liên quan.
- Subject liên kết sẽ được unlink, không xóa subject.
- Không cho xóa lớp đã có attendance session để bảo toàn dữ liệu điểm danh.

## 5. Semesters API

### Endpoint

```http
GET    /api/schedule
POST   /api/schedule
PUT    /api/schedule/semesters/:id
DELETE /api/schedule/semesters/:id
```

Danh sách học kỳ có thêm `subjectCount` để hiển thị thống kê nhanh.

### Body mẫu

```json
POST /api/schedule
{
  "semesterName": "2026.1",
  "startDate": "2026-09-01",
  "endDate": "2027-01-15"
}
```

`totalWeeks` và `weekRanges` có thể truyền từ client. Nếu bỏ trống, backend tự tính số tuần và tạo range mặc định:

```json
{
  "totalWeeks": 20,
  "weekRanges": [
    { "startWeek": 1, "endWeek": 20 }
  ]
}
```

### Validation

- Tên học kỳ không được rỗng.
- Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.
- `totalWeeks` phải là số nguyên dương.
- Không cho xóa học kỳ đã có subject.

## 6. Subjects/Schedules API

### Endpoint

```http
GET    /api/schedule/semesters/:semesterId/subjects
POST   /api/schedule/semesters/:semesterId/import
POST   /api/schedule/:semesterId/subjects
PUT    /api/schedule/subjects/:id
DELETE /api/schedule/subjects/:id
```

Endpoint GET dành cho Admin trả về subject kèm:

- `teacher`.
- `students`.
- `class` liên kết.
- Thông tin thời gian, phòng, ca học và mã lớp.

Import lịch dùng body `{ "rows": [...] }`. Mỗi dòng yêu cầu `studentCode`, `subjectCode`, `title`, `classCode`, `startDate` (YYYY-MM-DD, ngày học đầu tiên), `startTime`, `endTime`; có thể thêm `location`, `session`, `teacherEmail`. Lịch được app hiện tại lặp mỗi tuần dựa trên `startDate` trong phạm vi học kỳ. Các dòng chung mã môn, mã lớp và khung giờ được gộp thành một môn và nhận nhiều sinh viên. Backend xác thực toàn bộ mã sinh viên/giảng viên trước khi lưu transaction; tối đa 2.000 dòng.

### Body tạo subject

```json
POST /api/schedule/3/subjects
{
  "title": "Software Engineering",
  "subjectCode": "SE101",
  "classCode": "SE-A-2026",
  "location": "Room 301",
  "session": "MORNING",
  "startDate": "2026-09-05",
  "startTime": "2026-09-05T07:00:00.000Z",
  "endTime": "2026-09-05T09:00:00.000Z",
  "teacherId": 25,
  "studentIds": [31, 32]
}
```

`classCode` có thể bỏ trống khi tạo; backend sẽ sinh mã 6 chữ số.

### Body cập nhật subject

```json
PUT /api/schedule/subjects/101
{
  "location": "Room 402",
  "session": "AFTERNOON",
  "teacherId": 26
}
```

Khi truyền `teacherId: null`, giảng viên hiện tại sẽ được bỏ gán. Backend kiểm tra:

- `teacherId` phải trỏ tới user role `TEACHER`.
- `studentIds` phải trỏ tới user role `STUDENT`.
- `session` chỉ nhận `MORNING`, `AFTERNOON`, `EVENING`.
- `endTime` phải sau `startTime`.
- Các datetime phải hợp lệ.

Khi xóa subject, subject bị xóa cùng các `SubjectMember`; class liên kết không bị xóa.

## 7. Files chính đã thay đổi

### Users

- `src/modules/users/users.route.js`
- `src/modules/users/users.controller.js`
- `src/modules/users/users.service.js`
- `src/modules/profile/profile.service.js` (dữ liệu hồ sơ dùng model `Profile` sẵn có)
- `src/modules/auth/dto/register.dto.js`

### Classes

- `src/modules/classes/classes.route.js`
- `src/modules/classes/classes.controller.js`
- `src/modules/classes/classes.service.js`
- `src/modules/classes/classes.repository.js`

### Schedule/Semesters/Subjects

- `src/modules/schedule/schedule.route.js`
- `src/modules/schedule/schedule.controller.js`
- `src/modules/schedule/schedule.service.js`
- `src/modules/schedule/schedule.repository.js`
- `src/modules/schedule/dto/semester.dto.js`
- `src/app.js` (giới hạn JSON body cho file import)

## 8. Kiểm tra đã chạy

```bash
npm run build          # Prisma generate
npx prisma validate
node --check <backend-files>
```

Frontend đã chạy build và lint thành công sau khi nối các endpoint Admin.

## 9. Lưu ý khi test tích hợp

Để test đầy đủ API cần cấu hình:

- `DATABASE_URL` trỏ tới PostgreSQL.
- `JWT_SECRET` hợp lệ.
- Redis/Firebase nếu test các luồng realtime hoặc notification.

Nên test theo thứ tự: tạo user → tạo semester → tạo subject/gán teacher → tạo class → kiểm tra class/subject/member.

Nếu database báo thiếu bảng `AttendanceSession`, chạy migration đã có trong repo trước khi dùng API điểm danh: `npx prisma migrate deploy`, sau đó `npx prisma generate`. Danh sách lớp Admin không còn truy vấn số phiên điểm danh nên vẫn trả danh sách rỗng khi chưa tạo lớp.
