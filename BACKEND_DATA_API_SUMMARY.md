# School Hub Backend — Data & API Summary

> Cập nhật theo source hiện tại trong `school-hub-be`.
> Base URL logic: `/api`.
> Backend hiện có 95 khai báo route trong source; attendance routes được mount tại `/api/attendance` trong `src/app.js`.

## 1. Quy ước chung

- Các route có `authenticate` yêu cầu header `Authorization: Bearer <accessToken>`.
- Role dùng các giá trị: `ADMIN`, `TEACHER`, `STUDENT`.
- Lỗi không hoàn toàn thống nhất: một số API trả `{ message }`, một số trả `{ error }`.
- Date trong JSON thường được serialize thành ISO string. Riêng message trả timestamp epoch milliseconds.
- File attachment dùng object `{ name, url, mimeType, size }`; một số API cũng nhận trực tiếp URL string.
- `password` không được trả trong response public của auth/users.

## 2. Các bảng dữ liệu trong Prisma

### Nhóm tài khoản, lớp và nội dung

| Bảng | Cột chính / mục đích | Quan hệ chính |
|---|---|---|
| `User` | `id`, `name`, `email` unique, `studentCode` unique nullable, `password`, `avatar`, `role`, timestamps | Chủ của profile, token, file; thành viên lớp/môn; tác giả post/comment/message; sinh viên điểm danh |
| `Class` | `id`, `name`, `description`, `code` unique, timestamps | Có members, join requests, posts, subject, files, leave requests, attendance sessions |
| `ClassMember` | `id`, `userId`, `classId`, `joinedAt`; unique `(userId, classId)` | Bảng nối User–Class |
| `ClassJoinRequest` | `id`, `userId`, `classId`, `status`, timestamps; unique `(userId, classId)` | Yêu cầu tham gia lớp |
| `Post` | `id`, `title`, `content`, `type`, `dueDate`, `authorId`, `classId`, timestamps | Bài đăng/thông báo hoặc assignment; có attachments, comments, submissions |
| `Comment` | `id`, `content`, `postId`, `authorId`, timestamps | Bình luận của post; có attachments |
| `Submission` | `id`, `submittedAt`, `grade`, `feedback`, `status`, `postId`, `studentId`; unique `(studentId, postId)` | Bài nộp assignment; có attachments |
| `Attachment` | `id`, `name`, `url`, `mimeType`, `size`, nullable `postId/commentId/submissionId/messageId` | File đính kèm dùng chung cho post/comment/submission/message |

### Nhóm chat

| Bảng | Cột chính / mục đích | Quan hệ chính |
|---|---|---|
| `Conversation` | `id`, `name`, `avatar`, `type`, `privateKey` unique nullable, timestamps | Có participants và messages |
| `Participant` | `id`, `userId`, `conversationId`, `lastReadAt`; unique `(userId, conversationId)` | Bảng nối User–Conversation, lưu trạng thái đã đọc |
| `Message` | `id`, `content`, `isEdited`, `isDeleted`, timestamps, `senderId`, `conversationId` | Tin nhắn; có attachments |

### Nhóm lịch học

| Bảng | Cột chính / mục đích | Quan hệ chính |
|---|---|---|
| `Semester` | `id`, `semesterName`, `startDate`, `endDate`, `totalWeeks`, `weekRanges` JSON, timestamps | Có nhiều Subject |
| `Subject` | `id`, `title`, `subjectCode`, `classCode`, `location`, `startTime`, `endTime`, `startDate`, `classId` nullable unique, `semesterId`, `session` | Thuộc semester; có members; có thể liên kết Class |
| `SubjectMember` | `id`, `userId`, `subjectId`, `joinedAt`; unique `(userId, subjectId)` | Bảng nối User–Subject |

### Nhóm lưu phiên, profile và file

| Bảng | Cột chính / mục đích | Quan hệ chính |
|---|---|---|
| `RefreshToken` | `id`, `token` unique, `userId`, `expiresAt`, `createdAt` | Refresh token của User |
| `DriveFile` | `id`, `name`, `url`, `mimeType`, `size`, `isShared`, `ownerId`, `classId` nullable, timestamps | File cá nhân hoặc file chia sẻ theo lớp |
| `Profile` | `id`, `phone`, `birthDate`, `story`, `emailPersonal`, `nameSchool`, `nameClass`, `major`, `department`, `title`, `userId` unique | Profile 1–1 với User |
| `DeviceToken` | `id`, `token` unique, `userId`, `createdAt` | FCM token của thiết bị |
| `LeaveRequest` | `id`, `studentId`, `classId`, `date`, `reason`, `evidence`, `status`, timestamps | Đơn xin nghỉ; có thể liên kết AttendanceRecord |

### Nhóm điểm danh, BLE và nhận diện khuôn mặt

Schema/migration đã có các bảng dưới đây, nhưng hiện chưa có module route/controller/service REST tương ứng.

| Bảng | Cột chính / mục đích |
|---|---|
| `AttendanceDevice` | `deviceKey`, `name`, `type`, `status`, `ownerId`, `secretHash`, firmware, thời gian pair/last seen |
| `AttendanceSession` | `classId`, `subjectId`, `teacherId`, `deviceId`, `sessionCode`, ngày/giờ mở phiên, `status` |
| `AttendanceSessionConfig` | Cấu hình BLE/face/liveness, late, offline, ngưỡng RSSI/similarity, token BLE |
| `AttendanceRecord` | Kết quả theo `(sessionId, studentId)`: `status`, `verificationStatus`, `source`, score, review, leave request |
| `AttendanceAttempt` | Lần thử check-in, `clientAttemptId` unique, trạng thái đồng bộ online/offline, vị trí/network/error |
| `AttendanceBleEvidence` | Bằng chứng BLE: device/session advertised, RSSI, số lần scan, trạng thái xác minh |
| `AttendanceFaceVerification` | Challenge, model, embedding dimension, similarity/liveness/quality score, evidence URL, trạng thái |
| `FaceProfile` | Trạng thái đăng ký khuôn mặt theo User, model/version, consent/enrolled time |
| `FaceEmbeddingSample` | Embedding JSON, dimension, model/version, quality, góc mặt, source URL, active flag |
| `AttendanceReview` | Lịch sử reviewer, decision (`APPROVE`, `REJECT`, `MARK_PRESENT`, `MARK_ABSENT`, `MARK_EXCUSED`), note |

### Enum quan trọng

- `PostType`: `ANNOUNCEMENT`, `ASSIGNMENT`
- `SubmissionStatus`: `PENDING`, `SUBMITTED`, `LATE`, `GRADED`
- `JoinRequestStatus`: `PENDING`, `APPROVED`, `REJECTED`
- `ConversationType`: `PRIVATE`, `GROUP`
- `SessionType`: `MORNING`, `AFTERNOON`, `EVENING`
- `LeaveRequestStatus`: `PENDING`, `APPROVED`, `REJECTED`
- Attendance enums nằm trong `prisma/schema.prisma`, gồm device/session/record/attempt/evidence/face/review status.

## 3. REST API hiện có

### Auth — `/api/auth`

| Method + path | Quyền | Input | Output thành công |
|---|---|---|---|
| `POST /login` | Public | Body `{ email, password }` | `{ accessToken, refreshToken, expiresIn: 900, user }` |
| `POST /refresh` | Public | Body `{ refreshToken }` | `{ accessToken, refreshToken, expiresIn: 900 }`; token được rotate |
| `POST /register` | ADMIN | Body `{ name, email, password, role, studentCode? }` | HTTP 201, user mới không có `password` |
| `POST /change-password` | Bearer | Body `{ oldPassword, newPassword }`; password mới tối thiểu 6 ký tự | `{ message: "Password changed successfully" }` |
| `POST /logout` | Bearer | Body `{ refreshToken }` | `{ message: "Logged out" }` |

### Profile — `/api/profile`

| Method + path | Quyền | Input | Output |
|---|---|---|---|
| `GET /me` | Bearer | Không có | Profile gồm `phone, birthDate, story, emailPersonal, nameSchool, nameClass, major, department, title`; chưa có profile thì các field là `null` |
| `PATCH /me` | Bearer | Body cho phép các field profile ở trên | Profile sau khi upsert, không gồm `id/userId` |

### Assignments — `/api/assignments`

| Method + path | Quyền | Input | Output |
|---|---|---|---|
| `POST /` | TEACHER/ADMIN | Body `{ title, content, classCode, dueDate, attachments? }` | Post assignment tạo mới, gồm author, class, attachments |
| `GET /my-tasks` | STUDENT | Không có | `{ upcoming: [], pastDue: [], submitted: [] }`; mỗi item có assignment fields, class và submission hiện tại |
| `GET /my-submissions` | STUDENT | Không có | Mảng `{ assignment: { id, title, dueDate }, submission: { id, student, status, grade, feedback, submittedAt, attachments } }` |
| `GET /:id/student-detail` | STUDENT | `id` là post/assignment id | `{ id, title, content, dueDate, classCode, className, submission }` |
| `GET /:id/teacher-detail` | TEACHER/ADMIN | `id` là assignment id | `{ assignment, stats, students[] }`; stats gồm total/submitted/late/graded/notSubmitted |
| `POST /:id/submit` | STUDENT | Body `{ attachments: [] }`, bắt buộc có attachment | Submission DTO gồm `id, student, submittedAt, attachments, grade, feedback, status` |
| `POST /submissions/:id/grade` | TEACHER/ADMIN | Body `{ grade, feedback? }`; grade 0–10 | Submission đã grade, status `GRADED` |

### Classes, posts và comments — `/api/classes`

| Method + path | Quyền | Input | Output |
|---|---|---|---|
| `GET /` | Bearer | Không có | Mảng class user đang tham gia, thêm `membersCount`, `joinedAt` |
| `POST /` | TEACHER/ADMIN | Body `{ name, description?, code? }`; code bỏ trống sẽ tự sinh 6 số | Class mới: các field của `Class` |
| `GET /:classCode` | Bearer + member | Path `classCode` | `{ id, name, posts[] }`; post gồm author, attachments, comments |
| `POST /join` | Bearer | Body `{ code }` | `{ message, classId }`; tạo join request |
| `GET /:classCode/members` | Bearer + member | Path `classCode` | Mảng member `{ id, name, email, avatar, role, joinedAt }` |
| `GET /:classCode/members/page` | Bearer + member | Query `page?`, `limit?`, `search?` | `{ students[], teachers[], total, page, limit, totalPages }` |
| `GET /:classCode/join-requests` | TEACHER/ADMIN của lớp | Path `classCode` | Mảng request pending, kèm user |
| `POST /:classCode/join-requests/:requestId/handle` | TEACHER/ADMIN của lớp | Body `{ status: "APPROVED" | "REJECTED" }` | `{ message }` |
| `GET /admin/all` | ADMIN | Query `page?`, `limit?`, `search?` | `{ classes[], total, page, limit, totalPages }`; class có members, subject, counts |
| `PUT /:id` | ADMIN hoặc teacher của lớp | Body tùy chọn `{ name?, description?, code?, teacherId? }` | Class sau update |
| `DELETE /:id` | ADMIN | Path class id | `{ message: "Class deleted successfully" }` |
| `GET /:id/members/manage` | ADMIN | Query `page?`, `limit?`, `search?` | `{ members[], total, page, limit, totalPages }` |
| `GET /:id/members/candidates` | ADMIN | Query `search?` | `{ users: [...] }`; nếu search dưới 2 ký tự thì mảng rỗng |
| `POST /:id/members/manage` | ADMIN | Body `{ addUserIds?: [], removeUserIds?: [] }` hoặc `{ userId, action: "add"|"remove" }` | `{ addedCount, removedCount }` |
| `POST /posts` | TEACHER/STUDENT/ADMIN + member | Body `{ title, content, type, classCode, dueDate?, attachments? }`; type `ANNOUNCEMENT`/`ASSIGNMENT` | Post mới, gồm author, attachments, class |
| `GET /posts/:postId` | Bearer + member | Path post id | Post detail gồm author, classId, attachments, comments |
| `PUT /posts/:postId` | TEACHER/STUDENT/ADMIN + author/admin | Body partial `{ title?, content?, type?, dueDate? }` | Post sau update |
| `DELETE /posts/:postId` | TEACHER/STUDENT/ADMIN + author/admin | Path post id | `{ message: "Post deleted successfully" }` |
| `POST /posts/:postId/comments` | Bearer + member | Body `{ content?, attachments? }`; cần content hoặc attachment | Comment mới gồm author, attachments, post/class |
| `DELETE /posts/:postId/comments/:commentId` | Bearer + author/admin | Path comment id | `{ message: "Comment deleted successfully" }` |
| `GET /:classCode/posts/:postId/stats` | TEACHER/ADMIN của lớp | Path classCode, postId | `{ totalStudents, submittedCount, notSubmittedCount, lateCount }` |
| `GET /:classCode/assignments` | Bearer + member | Query `page?`, `limit?` | `{ data: [assignment posts], pagination: { page, limit, total } }` |

### Schedule — `/api/schedule`

| Method + path | Quyền | Input | Output |
|---|---|---|---|
| `GET /` | Bearer | Không có | Mảng semester summary `{ id, semesterName, startDate, endDate, totalWeeks, subjectCount }` |
| `GET /my` | Bearer | Query `semesterId?` | `{ id, semesterName, semesterStartDate, semesterEndDate, totalWeeks, weekRanges, subjects[] }` theo user |
| `POST /` | ADMIN | Body `{ semesterName, startDate, endDate, totalWeeks?, weekRanges? }` | Semester mới |
| `PUT /semesters/:id` | ADMIN | Body partial các field semester | Semester sau update |
| `DELETE /semesters/:id` | ADMIN | Path semester id | `{ message: "Semester deleted successfully" }`; không xóa được nếu còn subject |
| `GET /semesters/:semesterId/subjects` | ADMIN | Path semester id | Mảng subject đã serialize, kèm `class`, `teacher`, `students` |
| `POST /semesters/:semesterId/import` | ADMIN | Body `{ rows: [...] }`; mỗi row cần `studentCode, subjectCode, classCode, title, startDate, startTime, endTime`; có thể có `location, session, teacherEmail` | `{ importedSubjects, importedRows, message }`; tối đa 2.000 rows |
| `POST /:semesterId/subjects` | ADMIN | Body `{ title, subjectCode, classCode?, location, session, startTime, endTime, startDate, teacherId?, studentIds?, classId? }` | Subject mới |
| `PUT /subjects/:id` | ADMIN | Body chỉ cho phép các field subject ở trên | Subject sau update, kèm class/teacher/students |
| `DELETE /subjects/:id` | ADMIN | Path subject id | `{ message: "Subject deleted successfully" }` |

### Messages — `/api/messages`

| Method + path | Quyền | Input | Output |
|---|---|---|---|
| `GET /conversations` | Bearer | Query `skip?`, `take?` | Mảng conversation summary, có participant, lastMessage, `lastTime`, `unreadCount` |
| `GET /conversations/private` | Bearer | Query `receiverId` | `{ conversationId }`; tạo conversation private nếu chưa có |
| `GET /conversations/:id` | Bearer + participant | Path conversation id | Conversation summary |
| `GET /conversations/:id/messages` | Bearer + participant | Query `limit?`, `after?`, `before?` | Mảng Message DTO; `createdAt/updatedAt` là epoch ms, có `sender`, `attachments`, `isRead`, `status` |
| `PUT /conversations/:id/read` | Bearer + participant | Path conversation id | `{ success: true }` |
| `POST /messages` | TEACHER/STUDENT | Body `{ conversationId? | receiverId?, content?, attachments? }`; cần content hoặc attachment | Message DTO đã tạo |
| `PATCH /messages/:id` | Bearer + chính sender | Body `{ content }` | Message DTO đã sửa, `isEdited: true` |
| `DELETE /messages/:id` | Bearer + chính sender | Path message id | Message DTO sau soft-delete, `isDeleted: true`, content rỗng |

### Drive — `/api/drive`

Tất cả route trong nhóm này đều yêu cầu Bearer token.

| Method + path | Input | Output |
|---|---|---|
| `GET /usage` | Không có | `{ personalUsed, personalMax, sharedUsed, sharedMax }`; max lần lượt 2 GB và 5 GB |
| `POST /upload` | JSON `{ name, url, mimeType, size, isShared, classId? }` | DriveFile mới |
| `GET /personal` | Không có | Mảng file cá nhân của user |
| `GET /class/:classId` | Path class id | Mảng file shared, kèm owner `{ id, name, email, avatar }` |
| `DELETE /:id` | Path file id | HTTP 204, không body |

### Users và FCM — `/api/users`

| Method + path | Quyền | Input | Output |
|---|---|---|---|
| `GET /search` | Bearer | Query bắt buộc `query` | Tối đa 20 user `{ id, name, email, studentCode, role, avatar }` |
| `POST /fcm-token` | Bearer | Body `{ token }` | `{ message: "FCM token saved successfully" }` |
| `DELETE /fcm-token` | Bearer | Query `token` | `{ message: "FCM token deleted successfully" }` |
| `GET /` | ADMIN | Query `page?`, `limit?`, `role?`, `search?` | `{ users[], total, page, limit, totalPages }`, user kèm profile |
| `POST /` | ADMIN | Body `{ name, email, password, role?, studentCode?, profile? }` | User mới, không password |
| `GET /:id` | ADMIN | Path user id | User detail, không password |
| `PUT /:id` | ADMIN | Body partial `{ name?, email?, role?, studentCode?, profile? }` | User sau update, không password |
| `POST /:id/reset-password` | ADMIN | Body `{ newPassword }`, tối thiểu 6 ký tự | `{ message: "Password reset successfully" }` |
| `DELETE /:id` | ADMIN | Path user id | `{ message: "User deleted successfully" }` |

### Attendance — `/api/attendance`

| Method + path | Quyền | Query | Output |
|---|---|---|---|
| `GET /my/sessions` | STUDENT | `from?`, `to?`, `classId?`, `status?` | Danh sách phiên mà sinh viên là participant, kèm môn/lớp/giảng viên và trạng thái cá nhân `{ id, sessionId, subjectName, className, classCode, teacherName, attendanceDate, startsAt, expiresAt, room, sessionStatus, myAttendanceStatus, checkedInAt }` |
| `GET /my/sessions/:sessionId` | STUDENT participant | Path session id | Chi tiết phiên và record của chính sinh viên, kèm `sessionCode`, BLE scan config, `checkInAvailable` và trạng thái face profile |
| `GET /my/face-profile` | STUDENT | Không có | `{ status, sampleCount, consentAt, consentVersion, modelName, modelVersion, retentionExpiresAt }`; không trả embedding |
| `POST /my/face-profile/consent` | STUDENT | `{ consentVersion, purposes: ["ATTENDANCE_FACE_VERIFICATION"] }` | Ghi consent, chuyển profile sang `PENDING` |
| `POST /my/face-profile/enrollment` | STUDENT đã consent | `{ samples: [{ sampleType, embedding, modelName, modelVersion, qualityScore?, yaw?, pitch?, roll?, capturedAt? }] }` | Lưu đúng 3 pose `FRONT/LEFT/RIGHT` và tối đa 1 `EXTRA`; vector được mã hóa AES-256-GCM trước khi lưu |
| `DELETE /my/face-profile/consent` | STUDENT | Không có | Thu hồi consent, khóa profile và xóa mẫu embedding ngay |
| `POST /sessions/:sessionId/attempts` | STUDENT participant | `{ clientAttemptId, clientDeviceId? }` | Tạo attempt `RECEIVED`, mặc định có 90 giây cho quét BLE + face challenge; request lặp cùng UUID trả attempt cũ |
| `DELETE /attempts/:attemptId` | STUDENT sở hữu attempt | Path attempt id | Hủy attempt đang chạy, giải phóng record để sinh viên có thể bắt đầu lại |
| `POST /attempts/:attemptId/ble-evidence` | STUDENT sở hữu attempt | `{ advertisedSessionCode, token, scanCount, scanDurationMs, rssiMin?, rssiMax?, rssiAverage?, firstSeenAt?, lastSeenAt? }` | Server kiểm tra phiên, device, token challenge còn hạn và cấu hình scan; BLE hợp lệ trả face challenge dùng một lần |
| `POST /attempts/:attemptId/evidence` | STUDENT sở hữu attempt, BLE đã VERIFIED | `{ challengeNonce, completedChallengeType, probeEmbedding, dimension, modelName, modelVersion, livenessPassed, livenessScore?, qualityScore? }` | Server tự tính cosine similarity; kết quả là `PRESENT`, `LATE`, `REVIEW` hoặc cho thử lại; không nhận điểm similarity/verdict của app |
| `POST /devices/register` | TEACHER | `{ clientDeviceId, name?, appVersion? }` | DTO thiết bị đã đăng ký và `idempotent`; installation ID không lưu nguyên văn |
| `GET /my/devices` | TEACHER | Không có | Danh sách thiết bị do giảng viên hiện tại sở hữu |
| `DELETE /devices/:deviceId` | TEACHER owner / ADMIN | Path device id | `{ deviceId, status: "REVOKED" }`; không thu hồi nếu đang phát trong phiên ACTIVE |
| `GET /classes/:classId/sessions` | TEACHER quản lý lớp / ADMIN | `from?`, `to?` | Danh sách phiên trong lớp, kèm môn, thiết bị, cấu hình và số participant |
| `POST /classes/:classId/sessions` | TEACHER quản lý lớp | `{ subjectId?, attendanceDate, startsAt, expiresAt, deviceId, config? }` | Phiên mới ở trạng thái `DRAFT`, kèm cấu hình đã chuẩn hóa |
| `GET /sessions/:sessionId` | TEACHER phụ trách phiên / ADMIN | Path session id | Chi tiết phiên, device/config an toàn và số lượng theo trạng thái |
| `POST /sessions/:sessionId/start` | TEACHER phụ trách phiên / ADMIN | Path session id | Mở phiên, snapshot roster, tạo record `PENDING`; trả `participantCount` và token BLE ngắn hạn ban đầu |
| `POST /sessions/:sessionId/ble-token` | TEACHER phụ trách phiên / ADMIN | Path session id | Token BLE mới và thời điểm hết hạn; token cũ bị vô hiệu |
| `POST /sessions/:sessionId/end` | TEACHER phụ trách phiên / ADMIN | Path session id | Đóng phiên, chuyển record còn `PENDING` thành `ABSENT`, vô hiệu token BLE |
| `GET /sessions/:sessionId/records` | TEACHER phụ trách phiên / ADMIN | `status?`, `page?`, `limit?` | Roster theo snapshot, trạng thái từng record và tổng hợp số lượng theo trạng thái |
| `PATCH /records/:recordId/review` | TEACHER phụ trách phiên / ADMIN | `{ decision: "MARK_PRESENT" | "MARK_ABSENT", note }` | Chốt record `REVIEW`, ghi `AttendanceReview` và `AttendanceAuditLog` |

Face enrollment yêu cầu `ATTENDANCE_FACE_ENCRYPTION_KEY_BASE64` là khóa AES 32 byte dạng Base64. Face verification yêu cầu `ATTENDANCE_FACE_SIMILARITY_THRESHOLD` nằm trong khoảng `0..1`; hiện chưa đặt mặc định vì model embedding trên Android chưa được chọn/hiệu chỉnh. Nếu thiếu cấu hình ngưỡng, endpoint trả `503 FACE_VERIFICATION_NOT_CONFIGURED` thay vì tự đoán ngưỡng. `ATTENDANCE_FACE_RETENTION_DAYS` mặc định là 365 ngày; job hàng giờ xóa mẫu hết hạn và metadata score/challenge sau 30 ngày từ khi phiên kết thúc. Phiên ACTIVE tự finalize khi `expiresAt` đã qua; attempt đang mở bị đánh dấu `EXPIRED` khi phiên đóng.

Android đang dùng BLE service data UUID `7b7e2401-8d9c-4ea7-a5e1-2c89b47ef201` với frame UTF-8 `v1|<sessionCode>|<token>`. Vì frame lớn hơn giới hạn legacy advertisement, broadcaster cần hỗ trợ BLE extended advertising.

Migration mới `20261020090000_attendance_phase2_face_samples` bổ sung loại mẫu enrollment và hành động liveness đã cấp. Trước khi chạy backend với migration mới, deploy migrations rồi regenerate Prisma Client.

### Leave requests — `/api/leave-requests`

| Method + path | Quyền | Input | Output |
|---|---|---|---|
| `POST /` | Bearer | Body `{ classId, date, reason, evidence? }` | LeaveRequest DTO: id/studentId/classId/date/reason/evidence/status/createdAt/className/classCode |
| `GET /my-requests` | Bearer | Không có | Mảng LeaveRequest DTO của user |
| `GET /class/:classId` | TEACHER/ADMIN quản lý lớp | Path class id | Mảng LeaveRequest DTO, kèm thông tin student |
| `PATCH /:id/status` | TEACHER/ADMIN quản lý lớp | Body `{ status: "PENDING" | "APPROVED" | "REJECTED" }` | LeaveRequest DTO sau update |
| `GET /statistics/my` | Bearer | Không có | `{ total, pending, approved, rejected }` |
| `GET /statistics/class/:classId` | TEACHER/ADMIN quản lý lớp | Path class id | `{ total, pending, approved, rejected }` |

### Media upload — `/api/media`

| Method + path | Quyền | Input | Output |
|---|---|---|---|
| `POST /upload` | Bearer | `multipart/form-data`, field `files`, tối đa 5 file; upload qua Cloudinary | Mảng `{ name, url, mimeType, size }` để dùng lại làm attachment |

## 4. Realtime Socket.IO

Backend khởi tạo Socket.IO trong `src/server.js`. Payload chung có dạng:

```json
{
  "type": "...",
  "event": "...",
  "data": {}
}
```

Các nhóm event hiện được khai báo: post (`created/updated/deleted`), assignment (`created/updated/deleted`), submission (`created/updated/graded`), comment (`added/deleted`), message (`received/sent/edited/deleted/status_updated`), conversation created, class join request/approve/reject, member added/removed và notification received.

## 5. Những phần schema/code đã có nhưng API chưa có

1. Attendance REST API đã có tổng quan/chi tiết sinh viên, face consent/enrollment/revoke, attempt/BLE/face evidence, lifecycle phiên giảng viên và roster/review. Face verification cần model Android và threshold đã hiệu chỉnh; Android chưa nối các thao tác này.
2. `src/modules/admin/admin.route.js` và `admin.controller.js` hiện rỗng; admin CRUD thực tế đang nằm ở `/api/users`, `/api/classes`, `/api/schedule`.
3. Không có endpoint health/status được mount trong `src/app.js`.
4. Assignment đang có hai cách tạo tương đương: `POST /api/assignments` và `POST /api/classes/posts` với `type: "ASSIGNMENT"`.
5. Các enum, field và response đang dùng kết hợp raw Prisma object và DTO thủ công; khi tích hợp frontend nên chốt contract riêng cho từng endpoint.
