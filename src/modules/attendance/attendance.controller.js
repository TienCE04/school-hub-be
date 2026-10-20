import * as service from "./attendance.service.js";
import * as checkinService from "./attendance.checkin.service.js";

const sendError = (res, error) => {
  const statusCode = error.statusCode || 500;
  const code = error.code || (statusCode === 500 ? "INTERNAL_ERROR" : "ATTENDANCE_ERROR");
  if (statusCode >= 500) console.error("Attendance API error:", error);
  const message = statusCode >= 500
    ? "Attendance request failed"
    : error.message || "Attendance request failed";
  return res.status(statusCode).json({ error: { code, message }, message });
};

export const getMySessions = async (req, res) => {
  try {
    const sessions = await service.getMyAttendanceSessions(req.user.id, req.query);
    return res.status(200).json(sessions);
  } catch (error) {
    return sendError(res, error);
  }
};

export const getMyFaceProfile = async (req, res) => {
  try {
    const profile = await service.getMyFaceProfile(req.user.id);
    return res.status(200).json(profile);
  } catch (error) {
    return sendError(res, error);
  }
};

export const registerTeacherDevice = async (req, res) => {
  try {
    const device = await service.registerTeacherDevice(req.user, req.body);
    return res.status(device.idempotent ? 200 : 201).json(device);
  } catch (error) {
    return sendError(res, error);
  }
};

export const getMyTeacherDevices = async (req, res) => {
  try {
    const devices = await service.getMyTeacherDevices(req.user.id);
    return res.status(200).json(devices);
  } catch (error) {
    return sendError(res, error);
  }
};

export const revokeTeacherDevice = async (req, res) => {
  try {
    const result = await service.revokeTeacherDevice(req.user, req.params.deviceId);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const getTeacherClassSessions = async (req, res) => {
  try {
    const sessions = await service.getTeacherClassSessions(req.user, req.params.classId, req.query);
    return res.status(200).json(sessions);
  } catch (error) {
    return sendError(res, error);
  }
};

export const createTeacherSession = async (req, res) => {
  try {
    const session = await service.createTeacherSession(req.user, req.params.classId, req.body);
    return res.status(201).json(session);
  } catch (error) {
    return sendError(res, error);
  }
};

export const startTeacherSession = async (req, res) => {
  try {
    const result = await service.startTeacherSession(req.user, req.params.sessionId);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const rotateTeacherSessionBleToken = async (req, res) => {
  try {
    const result = await service.rotateTeacherSessionBleToken(req.user, req.params.sessionId);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const endTeacherSession = async (req, res) => {
  try {
    const result = await service.endTeacherSession(req.user, req.params.sessionId);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const getMySessionDetail = async (req, res) => {
  try {
    const detail = await checkinService.getStudentSessionDetail(req.user.id, req.params.sessionId);
    return res.status(200).json(detail);
  } catch (error) {
    return sendError(res, error);
  }
};

export const recordFaceConsent = async (req, res) => {
  try {
    const result = await checkinService.recordFaceConsent(req.user.id, req.body);
    return res.status(result.idempotent ? 200 : 201).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const enrollFaceProfile = async (req, res) => {
  try {
    const result = await checkinService.enrollFaceProfile(req.user.id, req.body);
    return res.status(result.idempotent ? 200 : 201).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const revokeFaceConsent = async (req, res) => {
  try {
    const result = await checkinService.revokeFaceConsent(req.user.id);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const createStudentAttendanceAttempt = async (req, res) => {
  try {
    const result = await checkinService.createStudentAttendanceAttempt(req.user.id, req.params.sessionId, req.body);
    return res.status(result.idempotent ? 200 : 201).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const cancelStudentAttendanceAttempt = async (req, res) => {
  try {
    const result = await checkinService.cancelStudentAttendanceAttempt(req.user.id, req.params.attemptId);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const submitBleEvidence = async (req, res) => {
  try {
    const result = await checkinService.submitBleEvidence(req.user.id, req.params.attemptId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const submitFaceEvidence = async (req, res) => {
  try {
    const result = await checkinService.submitFaceEvidence(req.user.id, req.params.attemptId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const getTeacherSessionRecords = async (req, res) => {
  try {
    const result = await checkinService.getTeacherSessionRecords(req.user, req.params.sessionId, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const getTeacherSessionDetail = async (req, res) => {
  try {
    const result = await checkinService.getTeacherSessionDetail(req.user, req.params.sessionId);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const reviewAttendanceRecord = async (req, res) => {
  try {
    const result = await checkinService.reviewAttendanceRecord(req.user, req.params.recordId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};
