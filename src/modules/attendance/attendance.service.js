// Backward-compatible attendance service entry point.
export { getMyAttendanceSessions, getMyFaceProfile } from "./attendance.student.service.js";
export { registerTeacherDevice, getMyTeacherDevices, revokeTeacherDevice } from "./attendance.device.service.js";
export {
  createTeacherSession, getTeacherClassSessions, getTeacherUpcomingLessonOptions,
} from "./attendance.teacher-session.service.js";
export {
  startTeacherSession, rotateTeacherSessionBleToken, endTeacherSession, finalizeExpiredAttendanceSessions,
  startDueAttendanceSessions,
} from "./attendance.session-lifecycle.service.js";
export { sendUpcomingAttendanceReminders } from "./attendance.reminder.service.js";
