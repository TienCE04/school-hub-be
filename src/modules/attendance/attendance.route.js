import express from "express";
import * as controller from "./attendance.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";

const router = express.Router();

router.get("/my/sessions", authenticate, authorize(["STUDENT"]), controller.getMySessions);
router.get("/my/sessions/:sessionId", authenticate, authorize(["STUDENT"]), controller.getMySessionDetail);
router.get("/my/face-profile", authenticate, authorize(["STUDENT"]), controller.getMyFaceProfile);
router.post("/my/face-profile/consent", authenticate, authorize(["STUDENT"]), controller.recordFaceConsent);
router.post("/my/face-profile/enrollment", authenticate, authorize(["STUDENT"]), controller.enrollFaceProfile);
router.delete("/my/face-profile/consent", authenticate, authorize(["STUDENT"]), controller.revokeFaceConsent);
router.post("/sessions/:sessionId/attempts", authenticate, authorize(["STUDENT"]), controller.createStudentAttendanceAttempt);
router.delete("/attempts/:attemptId", authenticate, authorize(["STUDENT"]), controller.cancelStudentAttendanceAttempt);
router.post("/attempts/:attemptId/ble-evidence", authenticate, authorize(["STUDENT"]), controller.submitBleEvidence);
router.post("/attempts/:attemptId/evidence", authenticate, authorize(["STUDENT"]), controller.submitFaceEvidence);

router.post("/devices/register", authenticate, authorize(["TEACHER"]), controller.registerTeacherDevice);
router.get("/my/devices", authenticate, authorize(["TEACHER"]), controller.getMyTeacherDevices);
router.delete("/devices/:deviceId", authenticate, authorize(["TEACHER", "ADMIN"]), controller.revokeTeacherDevice);

router.get("/classes/:classId/sessions", authenticate, authorize(["TEACHER", "ADMIN"]), controller.getTeacherClassSessions);
router.post("/classes/:classId/sessions", authenticate, authorize(["TEACHER"]), controller.createTeacherSession);
router.get("/sessions/:sessionId", authenticate, authorize(["TEACHER", "ADMIN"]), controller.getTeacherSessionDetail);
router.get("/sessions/:sessionId/records", authenticate, authorize(["TEACHER", "ADMIN"]), controller.getTeacherSessionRecords);
router.patch("/records/:recordId/review", authenticate, authorize(["TEACHER", "ADMIN"]), controller.reviewAttendanceRecord);
router.post("/sessions/:sessionId/start", authenticate, authorize(["TEACHER", "ADMIN"]), controller.startTeacherSession);
router.post("/sessions/:sessionId/ble-token", authenticate, authorize(["TEACHER", "ADMIN"]), controller.rotateTeacherSessionBleToken);
router.post("/sessions/:sessionId/end", authenticate, authorize(["TEACHER", "ADMIN"]), controller.endTeacherSession);

export default router;
