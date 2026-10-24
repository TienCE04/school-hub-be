// Backward-compatible attendance service entry point.
export { getMyAttendanceSessions, getMyFaceProfile } from "./attendance.student.service.js";
export { registerTeacherDevice, getMyTeacherDevices, revokeTeacherDevice } from "./attendance.device.service.js";
export { createTeacherSession, getTeacherClassSessions } from "./attendance.teacher-session.service.js";
export {
  startTeacherSession, rotateTeacherSessionBleToken, endTeacherSession, finalizeExpiredAttendanceSessions,
} from "./attendance.session-lifecycle.service.js";
