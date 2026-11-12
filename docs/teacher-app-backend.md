# Phân tích luồng giảng viên: Android app và backend

Tài liệu mô tả luồng giảng viên đang có trong mã nguồn School Hub: màn hình Android, các lời gọi HTTP/realtime, route Express, quyền truy cập và xử lý nghiệp vụ. Tài liệu được đối chiếu với app tại repo hiện tại và backend tại repo anh em school-hub-be.

## 1. Kiến trúc tổng quan

Luồng HTTP đi qua các lớp sau:

1. Fragment/Activity hiển thị màn hình và nhận thao tác giảng viên.
2. ViewModel điều phối coroutine, trạng thái loading/success/error và gọi repository.
3. Repository dùng ApiService Retrofit, chuyển DTO thành model/domain và cập nhật cache/Room khi cần.
4. AuthInterceptor thêm access token vào header.
5. Express mount route dưới /api, chạy authenticate, rồi authorize nếu route giới hạn role.
6. Controller nhận request và gọi service; service kiểm tra thêm quan hệ giảng viên-lớp, quy tắc nghiệp vụ và ghi Postgres qua Prisma.

Realtime đi theo luồng riêng: TeacherActivity kết nối Socket.IO bằng JWT; backend xác thực socket và đưa người dùng vào room user:<id> và class:<classId>. App parse sự kiện, đồng bộ dữ liệu xuống Room hoặc yêu cầu ViewModel tải lại. Push FCM là kênh riêng cho lúc app ở nền/không kết nối socket.

## 2. Đăng nhập, token và hồ sơ

| Endpoint | Dùng để làm gì | Ghi chú |
|---|---|---|
| **POST /api/auth/login** | Đăng nhập, lấy access/refresh token và thông tin tài khoản | Không cần đăng nhập trước. App lưu thông tin/token rồi định tuyến sang TeacherActivity nếu role là TEACHER. |
| **POST /api/auth/refresh** | Đổi refresh token lấy access token mới | Có khai báo trong ApiService và AccountRepository; không thấy AuthInterceptor tự gọi refresh khi gặp 401. |
| **POST /api/auth/logout** | Thu hồi phiên refresh token | Gọi khi logout. |
| **GET /api/profile/me** | Tải hồ sơ của tài khoản hiện tại | Cần JWT. |
| **PATCH /api/profile/me** | Cập nhật hồ sơ | App hiện gửi các trường email/story qua RemoteDataRepositoryImpl. |
| **POST /api/users/fcm-token** | Đăng ký FCM token gắn với tài khoản | App lấy token sau đăng nhập và gọi endpoint này. |
| **DELETE /api/users/fcm-token?token=...** | Xóa FCM token | App gọi từ luồng logout; endpoint và AccountRepository đều có. |

App tạo Retrofit ở NetworkDataModule với base URL kết thúc bằng /api/. AuthInterceptor đọc access token từ TokenManager, gửi Authorization: Bearer <token> cho request bình thường; header nội bộ No-Auth được gỡ trước khi gửi. Backend đọc JWT ở authenticate, đặt payload đã giải mã vào req.user; role middleware trả 403 nếu role không nằm trong danh sách cho phép.

Sau login, LoginViewModel.registerFcmToken() lấy token từ Firebase Messaging rồi gọi AccountRepository.saveFcmToken(). SchoolHubMessagingService.onNewToken() hiện chỉ có comment “Optionally send token”; khi Firebase đổi token, mã hiện tại chưa tự gọi API đăng ký lại cho đến một luồng đăng nhập tiếp theo.

## 3. Trang chủ và lịch giảng dạy

| Endpoint | Dùng để làm gì | Quyền backend |
|---|---|---|
| **GET /api/schedule** | Lấy danh sách học kỳ | Mọi tài khoản đã đăng nhập. |
| **GET /api/schedule/my?semesterId=<id>** | Lấy lịch/môn của người dùng trong học kỳ | Mọi tài khoản đã đăng nhập; service lọc subject theo thành viên subject. |
| **GET /api/classes?semesterId=<id>** | Lấy các lớp người dùng tham gia/phụ trách trong học kỳ | Mọi tài khoản đã đăng nhập; backend lọc theo membership. |

HomeViewModel.loadSummary() không gọi endpoint dashboard riêng. Nó lấy danh sách lớp qua getTeacherClasses() rồi tự cộng số lớp, sinh viên và trường pendingAttendanceReviewCount. Có một chỗ lệch tên trong backend: trường này đang được tính từ các LeaveRequest có status PENDING, không phải bản ghi attendance review. Lịch hôm nay cũng được tính phía app: tải subjects của học kỳ đã chọn, lọc startDate bằng ngày hiện tại của thiết bị và sắp xếp theo giờ bắt đầu.

App giảng viên chỉ đọc lịch. Các endpoint tạo/sửa/xóa học kỳ hoặc subject là POST /api/schedule, PUT /api/schedule/semesters/:id, DELETE /api/schedule/semesters/:id, POST /api/schedule/:semesterId/subjects, PUT /api/schedule/subjects/:id, DELETE /api/schedule/subjects/:id; chúng được backend giới hạn ADMIN và không được gọi từ luồng giảng viên.

## 4. Quản lý lớp, danh sách sinh viên và yêu cầu tham gia

| Endpoint | Dùng để làm gì | Role/kiểm tra thêm |
|---|---|---|
| **GET /api/classes?semesterId=<id>** | Danh sách lớp của giảng viên | Đã đăng nhập; kết quả dựa trên thành viên lớp. |
| **POST /api/classes** | Tạo lớp | TEACHER/ADMIN. |
| **PUT /api/classes/:id** | Sửa thông tin lớp | TEACHER/ADMIN; service xác minh giảng viên được phân công vào lớp hoặc ADMIN. |
| **GET /api/classes/:classCode** | Tải thông tin lớp | Thành viên lớp hoặc ADMIN. |
| **GET /api/classes/:classCode/members** | Tải toàn bộ thành viên | Thành viên lớp hoặc ADMIN. |
| **GET /api/classes/:classCode/members/page?page=&limit=&search=** | Tải roster có phân trang/tìm kiếm | Thành viên lớp hoặc ADMIN. App roster mặc định yêu cầu 20 bản ghi/trang. |
| **GET /api/classes/:classCode/join-requests** | Tải yêu cầu xin vào lớp | TEACHER/ADMIN, service yêu cầu quyền quản lý đúng lớp. |
| **POST /api/classes/:classCode/join-requests/:requestId/handle** | Duyệt/từ chối yêu cầu | TEACHER/ADMIN; body gồm status: APPROVED hoặc REJECTED. |

TeacherClassViewModel tải lớp theo học kỳ, cho lọc nhanh theo tên/mã lớp ở app và gọi API khi cập nhật. TeacherClassInfoViewModel tải lớp, trang roster đầu tiên và yêu cầu tham gia; thao tác tìm sinh viên đổi trang/query và trạng thái duyệt gọi API riêng. Backend kiểm tra yêu cầu còn PENDING; duyệt sẽ thêm ClassMember, từ chối chỉ cập nhật trạng thái.

Yêu cầu tham gia được backend phát Socket.IO event class_join_requested vào room của lớp. Khi duyệt, backend phát member_added cho room lớp và class_join_approved/class_join_rejected cho user xin vào. Trong WebSocketServiceImpl, app hiện không đăng ký listener cho các event class_join_requested, member_added, class_join_approved, class_join_rejected; màn hình đang dựa vào tải lại danh sách để cập nhật.

## 5. Bảng tin, bài đăng và tệp đính kèm

| Endpoint | Dùng để làm gì | Ghi chú |
|---|---|---|
| **GET /api/classes/:classCode/posts?page=&limit=** | Tải trang bài đăng của lớp | Thành viên lớp; backend giới hạn tối đa 50 bài/trang. App hiện gọi trang mặc định, lưu cache RAM và Room. |
| **POST /api/classes/posts** | Tạo thông báo hoặc bài tập | App tạo request có title, content, type, classCode, dueDate, attachments. Route cho TEACHER/STUDENT/ADMIN nhưng service chỉ cho TEACHER/ADMIN tạo loại ASSIGNMENT; ASSIGNMENT bắt buộc có hạn nộp. |
| **GET /api/classes/posts/:postId** | Tải chi tiết bài đăng | Cần đăng nhập; dùng trong đồng bộ sau event. |
| **POST /api/media/upload** | Upload tối đa 5 tệp multipart với field files | Cần đăng nhập; app nhận URL/metadata rồi gắn vào bài đăng. |

Backend createPost xác minh mã lớp và membership, chỉ nhận type ANNOUNCEMENT hoặc ASSIGNMENT, ghi post/attachments rồi phát post_created hoặc assignment_created vào room lớp. Backend cũng gọi FCM cho thành viên lớp. Mã hiện tại không loại người tạo khỏi danh sách FCM ở nhánh này, nên giảng viên có thể nhận thông báo về chính bài vừa tạo.

Backend còn có PUT /api/classes/posts/:postId, DELETE /api/classes/posts/:postId, POST /api/classes/posts/:postId/comments và DELETE /api/classes/posts/:postId/comments/:commentId. Các route này có trong backend nhưng ApiService hiện không khai báo phương thức tương ứng, vì vậy không thấy luồng Android giảng viên gọi chúng.

## 6. Bài tập và chấm bài

Backend cung cấp các route sau:

| Endpoint | Vai trò | Chức năng |
|---|---|---|
| **POST /api/assignments** | TEACHER/ADMIN | Tạo assignment theo module assignments. |
| **GET /api/assignments/:id/teacher-detail** | TEACHER/ADMIN | Lấy metadata, thống kê và bài nộp của từng sinh viên; service xác minh người gọi là giảng viên của lớp. |
| **POST /api/assignments/submissions/:id/grade** | TEACHER/ADMIN | Lưu điểm/nhận xét, chuyển submission sang GRADED; phát realtime/notification cho sinh viên. |
| **GET /api/classes/:classCode/assignments?page=&limit=** | Thành viên lớp | Danh sách assignment trong lớp. |
| **GET /api/classes/:classCode/posts/:postId/stats** | TEACHER/ADMIN | Thống kê assignment trong lớp. |

ApiService khai báo POST /assignments, GET /assignments/:id/teacher-detail và POST /assignments/submissions/:id/grade, nhưng không tìm thấy call site Android hiện tại dùng các hàm này; domain RemoteDataRepository cũng chưa có API chấm bài tương ứng. getClassAssignments() và route thống kê cũng chưa được nối vào repository giảng viên trong mã đã rà soát. Do đó backend có nghiệp vụ chấm bài, nhưng luồng UI giảng viên Android chưa được nối đầy đủ trong repo hiện tại.

App có thể tạo post type ASSIGNMENT qua RemoteDataRepositoryImpl.createPost() và endpoint /classes/posts; đây là đường tạo post chung. Nên phân biệt đường này với module /assignments dùng để xem chi tiết/chấm submission.

## 7. Điểm danh giảng viên và phát BLE

### API giảng viên

| Endpoint | Vai trò | Chức năng |
|---|---|---|
| **POST /api/attendance/devices/register** | TEACHER | Đăng ký thiết bị phát BLE hiện tại. |
| **GET /api/attendance/my/devices** | TEACHER | Liệt kê thiết bị của giảng viên. Có trong ApiService, nhưng chưa thấy luồng UI gọi. |
| **DELETE /api/attendance/devices/:deviceId** | TEACHER/ADMIN | Thu hồi thiết bị; backend từ chối nếu thiết bị đang có phiên ACTIVE. App hiện chưa khai báo API này. |
| **GET /api/attendance/classes/:classId/lesson-options?subjectId=** | TEACHER | Lấy tối đa 3 khung giờ học sắp tới để chọn phiên. |
| **GET /api/attendance/classes/:classId/sessions?from=&to=** | TEACHER/ADMIN | Danh sách phiên điểm danh của lớp, có thể lọc ngày. |
| **POST /api/attendance/classes/:classId/sessions** | TEACHER | Tạo phiên DRAFT hoặc SCHEDULED. |
| **GET /api/attendance/sessions/:sessionId** | TEACHER/ADMIN | Chi tiết phiên và config. |
| **GET /api/attendance/sessions/:sessionId/records?page=&limit=&status=** | TEACHER/ADMIN | Danh sách bản ghi điểm danh có phân trang/lọc. |
| **POST /api/attendance/sessions/:sessionId/start** | TEACHER/ADMIN | Mở phiên, tạo participant/record và cấp BLE token. |
| **POST /api/attendance/sessions/:sessionId/ble-token** | TEACHER/ADMIN | Cấp token BLE mới cho phiên đang ACTIVE. |
| **POST /api/attendance/sessions/:sessionId/end** | TEACHER/ADMIN | Kết thúc phiên và chốt các bản ghi còn pending. |
| **PATCH /api/attendance/records/:recordId/review** | TEACHER/ADMIN | Xử lý bản ghi cần review. Body: decision (MARK_PRESENT/MARK_ABSENT) và note. |
| **PATCH /api/attendance/records/:recordId/manual-check-in** | TEACHER/ADMIN | Đánh dấu có mặt thủ công; app hiện gửi body rỗng, backend dùng note mặc định. |
| **GET /api/attendance/classes/:classId/students** | TEACHER/ADMIN | Thống kê chuyên cần theo sinh viên. |
| **GET /api/attendance/classes/:classId/students/:studentId/records** | TEACHER/ADMIN | Lịch sử điểm danh một sinh viên trong lớp. |

### Logic vòng đời phiên

1. Màn hình điểm danh lấy lớp từ danh sách lớp giảng viên, tải phiên và tìm phiên SCHEDULED sắp tới. Nút tạo phiên yêu cầu đăng ký thiết bị hiện tại trước.
2. Backend xác minh giảng viên quản lý lớp, môn học thuộc đúng lớp, thiết bị ACTIVE thuộc tài khoản giảng viên và không có phiên ACTIVE khác cùng phạm vi lớp/giảng viên. Khóa/kiểm tra được thực hiện trong transaction để hạn chế tạo/mở phiên trùng.
3. startMode nhận MANUAL hoặc SCHEDULED. Phiên SCHEDULED phải bắt đầu cách hiện tại ít nhất 5 phút và thời điểm đó phải trùng một buổi học. Thời lượng backend chấp nhận là 15 hoặc 20 phút và phải nằm gọn trong khung giờ môn học.
4. Config mặc định: yêu cầu BLE và face, yêu cầu liveness, cho đi muộn, cho review thủ công; ngưỡng đi muộn 5 phút, 3 lần quét BLE trong 8 giây, mỗi lượt check-in tối đa 90 giây, thời lượng phiên 15 phút. allowOfflineAttempt đang bị đặt false khi tạo phiên.
5. Khi mở phiên, backend tạo snapshot participant cho sinh viên ACTIVE trong lớp và tạo AttendanceRecord trạng thái PENDING cho từng người. Thông tin participant snapshot giúp giữ danh sách tại thời điểm mở phiên.
6. endSession chốt phiên ACTIVE; tiến trình server cũng tự chốt phiên hết hạn. Các lần thử đang VERIFYING được đánh dấu EXPIRED, record PENDING đang VERIFYING bị chuyển verificationStatus sang REJECTED, rồi mọi record còn PENDING chuyển thành ABSENT. Backend phát attendance_records_changed để các màn hình tải lại.
7. Review chỉ chấp nhận record trạng thái REVIEW, yêu cầu bật allowManualReview, ghi người xử lý/thời gian/lý do/audit. Manual check-in chỉ áp dụng record PENDING hoặc ABSENT trong phiên ACTIVE/ENDED.

Khung buổi học được backend dựng trong attendance.session-timing.js: quy đổi lịch theo Asia/Ho_Chi_Minh, lấy ngày học đầu tiên của subject cộng từng tuần theo semester.weekRanges, rồi giới hạn bởi ngày bắt đầu/kết thúc học kỳ. Đây là nguồn chuẩn cho lesson-options, kiểm tra giờ tạo phiên và kiểm tra lúc bắt đầu phiên.

### BLE trên Android

AttendanceBleAdvertiser không bật phát liên tục toàn app. Nó được gọi trong luồng phiên điểm danh ACTIVE khi config yêu cầu BLE. App cần Bluetooth bật, quyền Bluetooth phù hợp Android, và thiết bị hỗ trợ BLE extended advertising. Advertisement không kết nối, không scannable, service UUID 7b7e2401-8d9c-4ea7-a5e1-2c89b47ef201; service data theo format v1|<sessionCode>|<token>. Beacon dừng khi kết thúc phiên hoặc khi ViewModel bị hủy. Fragment onStop hiện chỉ dừng polling, không gọi stop() cho beacon; vì thế nếu Activity xuống nền trong khi ViewModel còn tồn tại, phát BLE có thể tiếp tục.

Token được backend tạo ngẫu nhiên, chỉ lưu hash trong database. Thời hạn token 90 giây, app làm mới mỗi 60 giây. Server /start trả mã phiên và token ban đầu; app còn có thể gọi /ble-token khi mở lại màn hình/khôi phục phát. Vì vậy trạng thái phiên ở server và trạng thái phát BLE trên điện thoại là hai việc riêng: phiên có thể ACTIVE nhưng beacon chỉ hoạt động khi điện thoại giảng viên đang phát thành công.

### Danh sách live và đồng bộ

AttendanceRecordsViewModel tải trang records 100 bản ghi, tải các trang tiếp theo nếu cần, đồng thời lấy detail phiên. Màn hình mới đang dùng ViewPager2/tab để chia nhóm sinh viên; dữ liệu nguồn vẫn là một danh sách records đã tải, phần chia nhóm diễn ra phía app. ViewModel nghe attendance_records_changed và polling định kỳ 5 giây để cập nhật khi sự kiện bị lỡ.

## 8. Đơn xin nghỉ

Backend hiện có API giảng viên:

| Endpoint | Quyền | Chức năng |
|---|---|---|
| **GET /api/leave-requests/class/:classId** | TEACHER/ADMIN | Xem đơn của lớp; service kiểm tra giảng viên quản lý lớp. |
| **PATCH /api/leave-requests/:id/status** | TEACHER/ADMIN | Đổi trạng thái PENDING, APPROVED hoặc REJECTED. |
| **GET /api/leave-requests/statistics/class/:classId** | TEACHER/ADMIN | Thống kê đơn theo trạng thái của lớp. |

Trong Android ApiService hiện chỉ có các endpoint phía người xin nghỉ (POST /leave-requests, /my-requests, /statistics/my); không có khai báo gọi danh sách đơn theo lớp, cập nhật trạng thái hoặc thống kê theo lớp. Vì vậy chức năng duyệt đơn ở backend chưa được nối vào app giảng viên trong mã đã rà soát.

## 9. Chat và thông báo

### Chat

| Endpoint | Dùng để làm gì |
|---|---|
| **GET /api/messages/conversations** | Danh sách hội thoại. |
| **GET /api/messages/conversations/private?receiverId=** | Lấy hoặc tạo hội thoại riêng với người nhận. |
| **GET /api/messages/conversations/:id** | Chi tiết hội thoại. |
| **GET /api/messages/conversations/:id/messages?limit=&after=&before=** | Tải tin nhắn theo trang/cursor. |
| **POST /api/messages/messages** | Gửi tin nhắn; backend route cho TEACHER/STUDENT. |
| **PATCH /api/messages/messages/:id** | Sửa tin nhắn. |
| **DELETE /api/messages/messages/:id** | Xóa tin nhắn. |
| **GET /api/users/search?query=** | Tìm người để mở chat. |

Backend còn có PUT /api/messages/conversations/:id/read, nhưng ApiService chưa khai báo phương thức tương ứng. Message service phát socket cho người nhận và gọi FCM để lưu/hiển thị thông báo khi phù hợp. App dùng Socket.IO để ghi tin nhắn vào Room và phát popup trong app.

### Socket.IO và FCM

Socket.IO backend xác thực JWT ở handshake, đưa user vào room riêng và các room lớp. Các event app đang subscribe gồm attendance, message, post, assignment, submission, notification và conversation. SyncManager xử lý chat/post/assignment/submission; riêng NotificationEvent đang bị bỏ qua trong SyncManager. Màn attendance tự nghe sự kiện records thay đổi. Socket chủ yếu giúp app đang mở đồng bộ nhanh.

Push FCM dùng payload data-only để Android luôn chạy onMessageReceived, lưu một NotificationEntity xuống Room rồi mới hiện OS notification nếu màn hình hiện tại không bị NotificationState suppress và app có quyền thông báo. Khi role là TEACHER, notification intent mở TeacherActivity. Backend lưu FCM token theo user, gửi tới thiết bị và xóa token Firebase báo không còn hợp lệ.

Backend có job quét phiên điểm danh mỗi 30 giây. Khi reminderAt nằm trong 15 phút tiếp theo, phiên chưa gửi reminder và claim không bị giữ bởi worker khác, hệ thống gửi thông báo “Sắp đến giờ điểm danh” cho giảng viên tạo phiên cùng sinh viên ACTIVE của lớp. reminderClaimedAt/reminderSentAt giúp chống gửi trùng và có thể thử lại nếu gửi lỗi. Đây là notification cụ thể có người nhận là giảng viên.

Thông báo bài tập/bài đăng được phát qua socket và FCM từ service tạo nội dung. Thông báo join request hiện chỉ có socket event phía backend, không thấy đường FCM tương ứng. Backend không có endpoint inbox thông báo chung trong các route đã rà soát; FCM notification được lưu local trên thiết bị.

## 10. Các phần có trong backend nhưng chưa nối vào app giảng viên

- Chấm bài: backend có teacher-detail và grade submission; ApiService khai báo một phần nhưng không có call site/repository/ViewModel giảng viên trong mã hiện tại.
- Duyệt xin nghỉ: backend có list/update/statistics theo lớp; Android chỉ khai báo API student.
- Sửa/xóa bài đăng và comment: backend có route; Android ApiService hiện không khai báo các phương thức này.
- Quản lý thiết bị BLE: backend có liệt kê/thu hồi; app đang dùng đường đăng ký thiết bị nhưng chưa thấy UI gọi list/revoke.
- Đánh dấu hội thoại đã đọc: backend có route; app chưa khai báo API.
- Sửa lịch: route chỉnh semester/subject là ADMIN; app giảng viên chỉ đọc lịch.
- Socket sự kiện yêu cầu vào lớp: backend phát event; client chưa lắng nghe các event join/member nói trên.

## 11. Quyền truy cập và ranh giới bảo vệ dữ liệu

Backend dùng hai lớp kiểm tra. authenticate xác nhận JWT và role middleware giới hạn nhóm role ở route. Sau đó nhiều service kiểm tra thêm người gọi có phải thành viên/giảng viên của đúng class hay session không; ADMIN thường được phép vượt qua kiểm tra quan hệ lớp. Do đó role TEACHER đơn lẻ không đủ để thao tác tùy ý trên mọi lớp.

Nhóm điểm danh kiểm tra quyền quản lý ở class/session, ownership thiết bị, trạng thái phiên và trạng thái record. Review/manual check-in được ghi AttendanceReview và audit log trong transaction. Tạo/mở phiên và chốt record cũng dùng transaction để tránh hai yêu cầu đồng thời ghi trạng thái không nhất quán.

## 12. Bản đồ mã nguồn

**Android app**

- Retrofit endpoint declarations: app/src/main/java/com/tienhk/hust/school_hub/data/remote/network/ApiService.kt
- Retrofit/auth configuration: app/src/main/java/com/tienhk/hust/school_hub/di/NetworkDataModule.kt, data/remote/network/interceptor/AuthInterceptor.kt
- Repository mapping: data/repository/RemoteDataRepositoryImpl.kt, TeacherAttendanceRepositoryImpl.kt, MessageRepositoryImpl.kt, AccountRepositoryImpl.kt
- Màn hình lớp/roster: presentation/ui/teacher/feature/classes/
- Điểm danh giảng viên: presentation/ui/teacher/feature/attendance/
- BLE protocol/broadcaster: data/ble/attendance/AttendanceBleProtocol.kt, presentation/ui/teacher/feature/attendance/AttendanceBleAdvertiser.kt
- Socket/đồng bộ: data/repository/WebSocketServiceImpl.kt, domain/manager/SyncManager.kt, viewmodel/MainViewModel.kt
- FCM app handler: service/SchoolHubMessagingService.kt

**Backend repo school-hub-be**

- Router mounts /api: src/app.js
- Authentication/role checks: src/shared/middleware/auth.middleware.js, role.middleware.js
- Classes and posts: src/modules/classes/classes.route.js, classes.controller.js, classes.service.js, classes.repository.js
- Assignments: src/modules/assignments/assignments.route.js, assignments.service.js
- Attendance: src/modules/attendance/attendance.route.js, attendance.teacher-session.service.js, attendance.session-lifecycle.service.js, attendance.teacher-records.service.js, attendance.teacher-stats.service.js, attendance.session-timing.js, attendance.reminder.service.js
- Leave: src/modules/leave_requests/leave-requests.route.js, leave-requests.service.js
- Messages and FCM: src/modules/messages/, src/modules/users/, src/shared/utils/fcm.js
- Socket auth/rooms/events: src/config/socket.js, src/realtime/events/, src/modules/attendance/attendance.realtime.js
- Database relations/status enums: prisma/schema.prisma

## 13. Cách kiểm chứng luồng khi sửa tiếp

Khi thay đổi tính năng giảng viên, nên lần theo đúng ba điểm: khai báo request trong ApiService, call site từ ViewModel/repository Android, và route/controller/service backend. Nếu chỉ thêm endpoint vào ApiService thì UI chưa chắc gọi được; nếu chỉ có route backend thì app chưa dùng được. Với sự kiện realtime, cần kiểm tra cả backend phát event, tên/payload, danh sách listener trong WebSocketServiceImpl và consumer tương ứng.

## 14. Contract request/response chi tiết

Ví dụ dưới đây thể hiện cấu trúc và kiểu dữ liệu theo controller/DTO hiện tại. Đường dẫn đã gồm prefix /api. Các giá trị id, thời gian và nội dung chỉ để minh họa; trường optional có thể vắng mặt hoặc null tùy endpoint.

### 14.1 Header, ngày giờ và lỗi

Request cần đăng nhập gửi:

    Authorization: Bearer <accessToken>
    Content-Type: application/json

Upload dùng multipart/form-data; Android gửi file dưới field files.

Phần lớn thời gian được trả theo ISO-8601 UTC. Chat là ngoại lệ: createdAt và updatedAt của MessageDto là epoch milliseconds.

Backend chưa dùng cùng một dạng lỗi cho mọi module:

- Attendance: { "error": { "code": "...", "message": "..." }, "message": "..." }; code thường là VALIDATION_ERROR, FORBIDDEN, NOT_FOUND hoặc mã conflict.
- Classes, schedule, leave, profile: thường { "message": "..." }.
- Assignments: thường { "error": "..." }.
- Messages: thường { "error": "..." }; validation của gửi tin có thể trả { "message": "..." }.
- JWT không có/sai trả 401; role sai trả 403.

### 14.2 Đăng nhập, profile và schedule

#### POST /api/auth/login

Request:

    {
      "email": "teacher@example.edu",
      "password": "..."
    }

Response 200:

    {
      "accessToken": "<jwt>",
      "refreshToken": "<refresh-token>",
      "expiresIn": 900,
      "user": {
        "id": 12,
        "name": "Nguyễn Văn A",
        "email": "teacher@example.edu",
        "role": "TEACHER",
        "avatar": null
      }
    }

Backend lưu hash refresh token; access token có expiresIn 900 giây. App lưu role/token và sau login đăng ký FCM token.

#### POST /api/auth/refresh

Request:

    { "refreshToken": "<refresh-token>" }

Response 200:

    {
      "accessToken": "<new-jwt>",
      "refreshToken": "<rotated-refresh-token>",
      "expiresIn": 900
    }

Refresh token cũ được rotate. Token sai/hết hạn trả 401. Endpoint có trong repository, nhưng interceptor hiện không tự gọi refresh khi API khác gặp 401.

#### GET/PATCH /api/profile/me

GET không có body. Response là profile trực tiếp:

    {
      "phone": null,
      "birthDate": null,
      "story": "Giảng viên",
      "emailPersonal": "teacher@example.edu",
      "nameSchool": "School Hub",
      "nameClass": null,
      "major": null,
      "department": null,
      "title": "Giảng viên"
    }

PATCH chỉ cập nhật các trường được gửi trong whitelist: phone, birthDate, story, emailPersonal, nameSchool, nameClass, major, department, title. App repository hiện chỉ gửi emailPersonal/story.

#### GET /api/schedule

Không có body. Response là danh sách học kỳ:

    [
      {
        "id": 1,
        "semesterName": "2026.1",
        "startDate": "2026-10-31T17:00:00.000Z",
        "endDate": "2027-01-28T16:59:59.999Z",
        "totalWeeks": 12,
        "subjectCount": 6
      }
    ]

#### GET /api/schedule/my?semesterId=<id>

Response object:

    {
      "id": 1,
      "semesterName": "2026.1",
      "semesterStartDate": "2026-10-31T17:00:00.000Z",
      "semesterEndDate": "2027-01-28T16:59:59.999Z",
      "totalWeeks": 12,
      "weekRanges": [{ "startWeek": 1, "endWeek": 12 }],
      "subjects": [
        {
          "id": 6,
          "title": "Môn test Thứ 5",
          "subjectCode": "TEST-THU-2611-12",
          "classCode": "TEST-T5-2611",
          "location": "Phòng ...",
          "startTime": "2026-11-12T00:00:00.000Z",
          "endTime": "2026-11-12T13:00:00.000Z",
          "startDate": "2026-11-11T17:00:00.000Z",
          "session": "THURSDAY",
          "classId": 6,
          "semesterId": 1,
          "lessonPeriod": null,
          "cntMember": 5
        }
      ]
    }

Nếu bỏ semesterId, backend chọn học kỳ đầu theo startDate giảm dần. Subject trong response được lọc theo thành viên subject của user.

### 14.3 Lớp, roster và yêu cầu tham gia

#### GET /api/classes?semesterId=<id>

Không có body. Response là mảng lớp; service thêm thống kê dùng ở app:

    [
      {
        "id": 6,
        "semesterId": 1,
        "name": "Lớp test Thứ 5",
        "description": null,
        "code": "TEST-T5-2611",
        "membersCount": 6,
        "studentCount": 5,
        "subjectId": 6,
        "subjectName": "Môn test Thứ 5",
        "subjectSessionCount": 12,
        "subjectStartTime": "2026-11-12T00:00:00.000Z",
        "subjectEndTime": "2026-11-12T13:00:00.000Z",
        "pendingAttendanceReviewCount": 0,
        "joinedAt": "2026-11-01T..."
      }
    ]

Lưu ý pendingAttendanceReviewCount đang đếm LeaveRequest có status PENDING; tên field không khớp dữ liệu được đếm.

#### POST /api/classes

Request từ Android:

    {
      "name": "Lớp mới",
      "description": "Mô tả lớp",
      "code": "CLASS-001",
      "semesterId": 1
    }

name và semesterId bắt buộc. code có thể bỏ để server sinh mã 6 chữ số. Nếu mã lớp khớp subject chưa gắn lớp trong học kỳ, backend liên kết subject đó và thêm thành viên subject vào class. Người tạo cũng được thêm làm thành viên.

Response 201 là bản ghi Class:

    {
      "id": 20,
      "semesterId": 1,
      "name": "Lớp mới",
      "description": "Mô tả lớp",
      "code": "CLASS-001",
      "createdAt": "2026-11-12T...",
      "updatedAt": "2026-11-12T..."
    }

#### PUT /api/classes/:id

Body có thể gồm một hay nhiều trường: name, description, code, teacherId, semesterId. Response là bản ghi Class với các field cơ bản id, semesterId, name, description, code, createdAt, updatedAt. TEACHER chỉ sửa lớp mình quản lý; ADMIN có quyền quản trị.

#### GET /api/classes/:classCode/members/page?page=1&limit=20&search=

Response:

    {
      "students": [
        {
          "id": 34,
          "name": "Trần Thị B",
          "email": "student@example.edu",
          "studentCode": "SV001",
          "avatar": "",
          "role": "STUDENT",
          "joinedAt": "2026-11-12T..."
        }
      ],
      "teachers": [],
      "total": 5,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }

Backend giới hạn limit trong 1–50. App tải trang 1/20 khi mở roster và tải tiếp theo khi người dùng cuộn/tìm.

#### GET /api/classes/:classCode/members

Không có body. Response là array thành viên, mỗi phần tử có id, name, email, avatar, role, joinedAt. Đây là dạng không phân trang; màn roster hiện dùng endpoint /members/page.

#### GET /api/classes/:classCode/join-requests

Response là array:

    [
      {
        "id": 15,
        "userId": 34,
        "classId": 6,
        "status": "PENDING",
        "createdAt": "2026-11-12T...",
        "updatedAt": "2026-11-12T...",
        "user": {
          "id": 34,
          "name": "Trần Thị B",
          "email": "student@example.edu",
          "studentCode": "SV001",
          "avatar": "",
          "role": "STUDENT"
        }
      }
    ]

#### POST /api/classes/:classCode/join-requests/:requestId/handle

Request:

    { "status": "APPROVED" }

Chỉ nhận APPROVED/REJECTED; request phải còn PENDING và thuộc đúng lớp. Response 200:

    { "message": "Request has been approved" }

Approve tạo membership nếu student chưa là thành viên; backend phát socket events cho user/lớp.

### 14.4 Bài đăng, bài tập và tệp đính kèm

#### GET /api/classes/:classCode/posts?page=1&limit=20

Response:

    {
      "posts": [
        {
          "id": 101,
          "title": "Thông báo",
          "content": "<p>Nội dung</p>",
          "type": "ANNOUNCEMENT",
          "createdAt": "2026-11-12T...",
          "updatedAt": "2026-11-12T...",
          "dueDate": null,
          "classId": 6,
          "author": {
            "id": 12,
            "name": "Nguyễn Văn A",
            "avatar": "",
            "email": "teacher@example.edu",
            "role": "TEACHER"
          },
          "attachments": [],
          "comments": [],
          "commentCount": 0
        }
      ],
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }

#### POST /api/classes/posts

Request từ Android:

    {
      "title": "Bài tập tuần 1",
      "content": "<p>Yêu cầu</p>",
      "type": "ASSIGNMENT",
      "classCode": "TEST-T5-2611",
      "dueDate": "2026-11-20T16:59:00.000Z",
      "attachments": [
        {
          "name": "baitap.pdf",
          "url": "https://...",
          "mimeType": "application/pdf",
          "size": 12345
        }
      ]
    }

type là ANNOUNCEMENT hoặc ASSIGNMENT. Assignment cần dueDate và chỉ TEACHER/ADMIN tạo được. Response 201 là post vừa tạo với post fields, author, attachments; object có thể kèm class data thừa so với Android PostDto.

#### GET /api/classes/:classCode/assignments?page=1&limit=10

Response dạng phân trang:

    {
      "data": [{ "id": 101, "title": "Bài tập tuần 1", "type": "ASSIGNMENT", "dueDate": "2026-11-20T...", "author": { "id": 12, "name": "Nguyễn Văn A" }, "attachments": [] }],
      "pagination": { "page": 1, "limit": 10, "total": 1 }
    }

Endpoint backend yêu cầu membership lớp; ApiService có khai báo nhưng chưa thấy repository/viewmodel giảng viên gọi.

#### POST /api/media/upload

Request multipart/form-data, gửi tối đa 5 file dưới field files. Response là array:

    [
      {
        "name": "baitap.pdf",
        "url": "https://cloudinary.example/...",
        "mimeType": "application/pdf",
        "size": 12345
      }
    ]

App upload file trước rồi đưa các object nhận được vào attachments của bài đăng.

### 14.5 Điểm danh: request và response

#### POST /api/attendance/devices/register

Request:

    {
      "clientDeviceId": "android-installation-id",
      "name": "Điện thoại giảng viên",
      "appVersion": "1.0.0"
    }

#### GET /api/attendance/my/devices và DELETE /api/attendance/devices/:deviceId

GET không có body; response là array cùng device shape của register. DELETE không có body, response:

    { "deviceId": 3, "status": "REVOKED" }

Backend từ chối thu hồi nếu thiết bị đó còn gắn với phiên ACTIVE. GET đã khai báo trong ApiService nhưng chưa thấy call site; DELETE hiện không có method trong ApiService.

clientDeviceId dài 8–128 ký tự và chỉ nhận chữ/số hoặc . _ : -. name tối đa 80 ký tự, appVersion tối đa 40. Server hash clientDeviceId cùng userId; không lưu nguyên installation ID. Response 201 khi mới, 200 khi retry idempotent:

    {
      "id": 3,
      "deviceId": 3,
      "deviceKey": "<hash>",
      "name": "Điện thoại giảng viên",
      "type": "TEACHER_PHONE",
      "status": "ACTIVE",
      "firmwareVersion": null,
      "pairedAt": null,
      "lastSeenAt": null,
      "createdAt": "2026-11-12T..."
    }

#### GET /api/attendance/classes/:classId/lesson-options?subjectId=<id>

Không có body. Response là array các lesson window:

    [
      {
        "startsAt": "2026-11-19T00:00:00.000Z",
        "endsAt": "2026-11-19T13:00:00.000Z"
      }
    ]

Backend trả tối đa 3 buổi tương lai theo timezone Asia/Ho_Chi_Minh và khung tuần của semester.

#### POST /api/attendance/classes/:classId/sessions

Request thực tế từ app:

    {
      "subjectId": 6,
      "deviceId": 3,
      "startMode": "SCHEDULED",
      "startsAt": "2026-11-19T00:00:00.000Z",
      "config": {
        "requireBle": true,
        "requireFace": true,
        "faceLivenessRequired": true,
        "allowLate": true,
        "lateAfterMinutes": 5,
        "allowManualReview": true,
        "bleMinScanCount": 3,
        "bleScanDurationSeconds": 8,
        "durationMinutes": 15
      }
    }

startMode nhận MANUAL/SCHEDULED. SCHEDULED cần startsAt hợp lệ, cách hiện tại ít nhất 5 phút và thuộc buổi học. durationMinutes nhận 15 hoặc 20. MANUAL cho phép startsAt null. Backend hỗ trợ maxAttemptSeconds nhưng DTO app hiện không gửi nên mặc định 90; allowOfflineAttempt hiện bị server ép false.

Response 201 là TeacherAttendanceSessionDto:

    {
      "id": 40,
      "sessionId": 40,
      "classId": 6,
      "className": "Lớp test Thứ 5",
      "classCode": "TEST-T5-2611",
      "subjectId": 6,
      "subjectName": "Môn test Thứ 5",
      "attendanceDate": "2026-11-19T00:00:00.000Z",
      "startsAt": "2026-11-19T00:00:00.000Z",
      "expiresAt": "2026-11-19T00:15:00.000Z",
      "endedAt": null,
      "status": "SCHEDULED",
      "device": { "id": 3, "name": "Điện thoại giảng viên", "type": "TEACHER_PHONE", "status": "ACTIVE" },
      "config": {
        "requireBle": true,
        "requireFace": true,
        "faceLivenessRequired": true,
        "allowLate": true,
        "lateAfterMinutes": 5,
        "allowManualReview": true,
        "bleMinScanCount": 3,
        "bleScanDurationSeconds": 8,
        "durationMinutes": 15
      },
      "participantCount": 0,
      "countCheckIn": 0
    }

Phiên MANUAL có status DRAFT. sessionCode/token chưa có trong response tạo, token chỉ cấp khi phiên start.

#### GET /api/attendance/classes/:classId/sessions?from=&to=

from/to nhận YYYY-MM-DD hoặc timestamp. Response là array session DTO như trên. Status trên list hiển thị ENDED nếu expiresAt đã qua, kể cả trước khi worker cập nhật DB.

#### GET /api/attendance/sessions/:sessionId

Response là object session, có teacherName và summary:

    {
      "id": 40,
      "sessionId": 40,
      "classId": 6,
      "className": "Lớp test Thứ 5",
      "classCode": "TEST-T5-2611",
      "subjectId": 6,
      "subjectName": "Môn test Thứ 5",
      "teacherName": "Nguyễn Văn A",
      "attendanceDate": "2026-11-19T00:00:00.000Z",
      "startsAt": "2026-11-19T00:00:00.000Z",
      "expiresAt": "2026-11-19T00:15:00.000Z",
      "endedAt": null,
      "status": "ACTIVE",
      "device": { "id": 3, "name": "Điện thoại giảng viên", "type": "TEACHER_PHONE", "status": "ACTIVE", "lastSeenAt": null },
      "config": { "requireBle": true, "requireFace": true, "faceLivenessRequired": true, "allowLate": true, "lateAfterMinutes": 5, "allowManualReview": true, "bleMinScanCount": 3, "bleScanDurationSeconds": 8, "durationMinutes": 15 },
      "participantCount": 5,
      "summary": { "PENDING": 2, "PRESENT": 2, "LATE": 1, "ABSENT": 0, "REVIEW": 0, "REJECTED": 0, "EXCUSED": 0 }
    }

summary luôn có key của các status; số ở ví dụ chỉ minh họa.

#### GET /api/attendance/sessions/:sessionId/records?page=1&limit=100&status=

Response:

    {
      "session": {
        "id": 40,
        "sessionId": 40,
        "classId": 6,
        "className": "Lớp test Thứ 5",
        "classCode": "TEST-T5-2611",
        "subjectName": "Môn test Thứ 5",
        "teacherName": "Nguyễn Văn A",
        "attendanceDate": "2026-11-19T00:00:00.000Z",
        "startsAt": "2026-11-19T00:00:00.000Z",
        "expiresAt": "2026-11-19T00:15:00.000Z",
        "endedAt": null,
        "status": "ACTIVE",
        "participantCount": 5
      },
      "summary": { "PENDING": 2, "PRESENT": 2, "LATE": 1, "ABSENT": 0, "REVIEW": 0, "REJECTED": 0, "EXCUSED": 0 },
      "records": [
        {
          "id": 90,
          "recordId": 90,
          "studentId": 34,
          "studentName": "Trần Thị B",
          "studentCode": "SV001",
          "status": "PRESENT",
          "verificationStatus": "VERIFIED",
          "source": "ONLINE",
          "attemptedAt": "2026-11-19T00:03:00.000Z",
          "checkedInAt": "2026-11-19T00:04:00.000Z",
          "reviewedAt": null,
          "reviewedBy": null,
          "reviewNote": null,
          "bleEvidence": { "rssiMin": -62, "rssiMax": -48, "rssiAverage": -55.2, "scanCount": 3, "scanDurationMs": 8000, "status": "VERIFIED", "verifiedAt": "2026-11-19T00:04:00.000Z", "failureReason": null },
          "faceVerification": { "challengeType": "LIVENESS", "similarityScore": 0.91, "qualityScore": 0.84, "modelName": "model", "modelVersion": "1", "embeddingDimension": 512, "status": "VERIFIED", "processedAt": "2026-11-19T00:04:00.000Z", "failureReason": null }
        }
      ],
      "page": 1,
      "limit": 100,
      "total": 5,
      "totalPages": 1
    }

limit tối đa 100. status có thể lọc PENDING/PRESENT/LATE/ABSENT/EXCUSED/REVIEW/REJECTED.

#### POST /api/attendance/sessions/:sessionId/start

Không có body. Response 200:

    {
      "sessionId": 40,
      "status": "ACTIVE",
      "participantCount": 5,
      "bleBroadcast": {
        "sessionCode": "0123456789ABCDEF",
        "token": "<short-lived-secret>",
        "expiresAt": "2026-11-19T00:01:30.000Z",
        "rotateEverySeconds": 60
      },
      "sessionExpiresAt": "2026-11-19T00:15:00.000Z"
    }

Token plaintext chỉ trả để app phát; DB giữ hash. Response của POST /ble-token có sessionId + bleBroadcast, không có status/participantCount/sessionExpiresAt.

Response đầy đủ khi POST /api/attendance/sessions/:sessionId/ble-token:

    {
      "sessionId": 40,
      "bleBroadcast": {
        "sessionCode": "0123456789ABCDEF",
        "token": "<short-lived-secret>",
        "expiresAt": "2026-11-19T00:01:30.000Z",
        "rotateEverySeconds": 60
      }
    }

#### PATCH /api/attendance/records/:recordId/review và manual-check-in

Review request:

    {
      "decision": "MARK_PRESENT",
      "note": "Đã đối chiếu danh sách lớp"
    }

decision chỉ MARK_PRESENT/MARK_ABSENT; note bắt buộc 1–500 ký tự; record phải ở trạng thái REVIEW và phiên bật allowManualReview.

App manual-check-in hiện gửi object rỗng; server dùng note mặc định. Có thể gửi { "note": "Điểm danh trực tiếp" }. Cả hai trả:

    {
      "recordId": 90,
      "studentId": 34,
      "status": "PRESENT",
      "verificationStatus": "VERIFIED",
      "reviewedById": 12,
      "reviewedAt": "2026-11-19T00:05:00.000Z",
      "reviewNote": "Đã đối chiếu danh sách lớp"
    }

Manual check-in chỉ áp dụng record PENDING/ABSENT trong phiên ACTIVE/ENDED.

#### POST /api/attendance/sessions/:sessionId/end

Không có body. Response:

    {
      "sessionId": 40,
      "status": "ENDED",
      "absentCount": 2,
      "endedAt": "2026-11-19T00:15:00.000Z"
    }

absentCount là số record PENDING được chuyển sang ABSENT trong transaction.

#### Thống kê và lịch sử chuyên cần

GET /api/attendance/classes/:classId/students trả:

    {
      "students": [
        {
          "studentId": 34,
          "studentName": "Trần Thị B",
          "studentCode": "SV001",
          "countCheckIn": 8,
          "totalSessions": 10
        }
      ]
    }

countCheckIn đếm PRESENT + LATE; totalSessions đếm toàn bộ records của sinh viên trong lớp.

GET /api/attendance/classes/:classId/students/:studentId/records trả:

    {
      "records": [
        {
          "recordId": 90,
          "sessionId": 40,
          "attendanceDate": "2026-11-19T00:00:00.000Z",
          "startsAt": "2026-11-19T00:00:00.000Z",
          "status": "PRESENT",
          "verificationStatus": "VERIFIED",
          "checkedInAt": "2026-11-19T00:04:00.000Z"
        }
      ]
    }

### 14.6 Assignment và duyệt đơn nghỉ: contract backend

Các contract này có backend route nhưng chưa nối thành màn hình giảng viên Android.

#### POST /api/assignments

Request:

    {
      "title": "Bài tập tuần 1",
      "content": "Nội dung bài tập",
      "classCode": "TEST-T5-2611",
      "dueDate": "2026-11-20T16:59:00.000Z",
      "attachments": []
    }

title, content, classCode, dueDate bắt buộc. Response 201 là post vừa tạo; backend phát assignment_created và notification cho thành viên khác tác giả.

#### GET /api/assignments/:id/teacher-detail

Không có body. Response:

    {
      "assignment": {
        "id": 101,
        "title": "Bài tập tuần 1",
        "content": "Nội dung bài tập",
        "dueDate": "2026-11-20T16:59:00.000Z",
        "classId": 6,
        "classCode": "TEST-T5-2611",
        "className": "Lớp test Thứ 5",
        "author": { "id": 12, "name": "Nguyễn Văn A", "avatar": "", "email": "teacher@example.edu", "role": "TEACHER" }
      },
      "stats": {
        "totalStudents": 5,
        "submittedCount": 3,
        "lateCount": 1,
        "gradedCount": 2,
        "notSubmittedCount": 2
      },
      "students": [
        {
          "student": { "id": 34, "name": "Trần Thị B", "avatar": "", "email": "student@example.edu", "role": "STUDENT" },
          "submission": {
            "id": 200,
            "student": { "id": 34, "name": "Trần Thị B", "avatar": "", "email": "student@example.edu", "role": "STUDENT" },
            "submittedAt": "2026-11-19T...",
            "attachments": [],
            "grade": null,
            "feedback": null,
            "status": "SUBMITTED"
          }
        }
      ]
    }

Sinh viên chưa nộp có submission: null. submittedCount gồm submission status SUBMITTED/LATE/GRADED.

#### POST /api/assignments/submissions/:id/grade

Request:

    {
      "grade": 9.5,
      "feedback": "Làm tốt"
    }

grade từ 0 đến 10; feedback optional. Response 200 là Submission:

    {
      "id": 200,
      "student": { "id": 34, "name": "Trần Thị B", "avatar": "", "email": "student@example.edu", "role": "STUDENT" },
      "submittedAt": "2026-11-19T...",
      "attachments": [],
      "grade": 9.5,
      "feedback": "Làm tốt",
      "status": "GRADED"
    }

#### GET /api/classes/:classCode/posts/:postId/stats

Không có body. Response:

    {
      "totalStudents": 5,
      "submittedCount": 3,
      "notSubmittedCount": 2,
      "lateCount": 1
    }

#### GET /api/leave-requests/class/:classId và PATCH /api/leave-requests/:id/status

GET trả array LeaveRequest:

    [
      {
        "id": 15,
        "studentId": 34,
        "classId": 6,
        "date": "2026-11-19T00:00:00.000Z",
        "reason": "Bị ốm",
        "evidence": "https://...",
        "status": "PENDING",
        "createdAt": "2026-11-18T...",
        "className": "Lớp test Thứ 5",
        "classCode": "TEST-T5-2611",
        "student": { "id": 34, "name": "Trần Thị B", "studentCode": "SV001", "avatar": "" }
      }
    ]

PATCH request:

    { "status": "APPROVED" }

status nhận PENDING/APPROVED/REJECTED. Response là LeaveRequest đã cập nhật. GET /api/leave-requests/statistics/class/:classId trả bộ đếm, ví dụ { "total": 4, "pending": 1, "approved": 2, "rejected": 1 }.

### 14.7 Chat, FCM và tiện ích

#### POST /api/messages/messages

Request có thể gửi conversationId hoặc receiverId:

    {
      "conversationId": 42,
      "content": "Chào bạn",
      "attachments": []
    }

Cần conversationId hoặc receiverId; đồng thời cần content hoặc attachments. Response 201:

    {
      "id": 301,
      "sender": { "id": 12, "name": "Nguyễn Văn A", "email": "teacher@example.edu", "role": "TEACHER" },
      "content": "Chào bạn",
      "attachments": [],
      "createdAt": 1794441600000,
      "updatedAt": null,
      "isEdited": false,
      "isDeleted": false,
      "isRead": true,
      "status": "SENT"
    }

createdAt/updatedAt là epoch milliseconds. Backend phát message_sent/message_received qua socket và gửi FCM.

#### GET /api/messages/conversations

Backend hỗ trợ skip/take, mặc định 0/30. ApiService hiện không truyền query nên lấy mặc định. Response là array:

    [
      {
        "id": 42,
        "name": "PRIVATE",
        "avatar": null,
        "type": "PRIVATE",
        "participant": { "id": "34", "nameUser": "Trần Thị B", "email": "student@example.edu", "role": "STUDENT" },
        "lastMessage": null,
        "lastTime": 1794441600000,
        "unreadCount": 2
      }
    ]

#### GET /api/messages/conversations/private?receiverId=<id>

Response:

    { "conversationId": 42 }

#### GET /api/messages/conversations/:id/messages?limit=&after=&before=

Response là array MessageDto. Android mặc định limit 30; after/before là cursor id dạng số.

#### PUT /api/messages/conversations/:id/read

Không có body. Response:

    { "success": true }

Endpoint backend có nhưng Android chưa khai báo trong ApiService.

#### PATCH/DELETE /api/messages/messages/:id

PATCH body:

    { "content": "Nội dung đã sửa" }

Response là MessageDto. Chỉ người gửi được sửa/xóa tin của mình. DELETE trả message object theo xử lý soft-delete của service.

#### POST/DELETE /api/users/fcm-token

POST body:

    { "token": "<firebase-registration-token>" }

POST response:

    { "message": "FCM token saved successfully" }

DELETE truyền token qua query và trả:

    { "message": "FCM token deleted successfully" }

#### GET /api/users/search?query=

query bắt buộc. Response là array user công khai gồm id, name, email, studentCode, avatar, role.

### 14.8 Ghi chú contract

- Ví dụ làm rõ cấu trúc/kiểu dữ liệu; giá trị id, thời gian và nội dung sẽ thay đổi khi chạy thật.
- Một số response backend trả thêm field từ Prisma; Gson có thể bỏ qua field ngoài Android DTO.
- Endpoint backend-only đã đánh dấu ở phần 10 chưa chắc được gọi từ UI giảng viên hiện tại.
- Khi đổi contract, cần cập nhật Android DTO, repository mapping và backend validation/serializer cùng lúc; nếu chỉ sửa một phía, app có thể nhận thiếu field hoặc backend trả 400.
