// Backward-compatible attendance service entry point.
export {
  getStudentSessionDetail, recordFaceConsent, enrollFaceProfile, revokeFaceConsent,
} from "./attendance.face-profile.service.js";
export {
  createStudentAttendanceAttempt, cancelStudentAttendanceAttempt,
} from "./attendance.attempt.service.js";
export { submitBleEvidence } from "./attendance.ble-checkin.service.js";
export { submitFaceEvidence } from "./attendance.face-checkin.service.js";
export {
  getTeacherSessionRecords, getTeacherSessionDetail, reviewAttendanceRecord,
  manualCheckInAttendanceRecord,
} from "./attendance.teacher-records.service.js";
export { getTeacherClassStudentStats, getTeacherStudentRecords } from "./attendance.teacher-stats.service.js";
export {
  purgeExpiredFaceProfiles, purgeExpiredAttendanceFaceEvidence,
} from "./attendance.retention.service.js";
