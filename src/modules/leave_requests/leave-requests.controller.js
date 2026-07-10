import * as leaveRequestService from "./leave-requests.service.js";

export const createLeaveRequest = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { classId, date, reason, evidence } = req.body;
    
    const request = await leaveRequestService.createLeaveRequest({
      studentId,
      classId: parseInt(classId),
      date: new Date(date),
      reason,
      evidence
    });
    
    return res.status(201).json(request);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getMyRequests = async (req, res) => {
  try {
    const studentId = req.user.id;
    const requests = await leaveRequestService.getStudentLeaveRequests(studentId);
    return res.json(requests);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getClassRequests = async (req, res) => {
  try {
    const { classId } = req.params;
    const requests = await leaveRequestService.getClassLeaveRequests(classId);
    return res.json(requests);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const updatedRequest = await leaveRequestService.updateLeaveRequestStatus(id, status);
    return res.json(updatedRequest);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getMyStatistics = async (req, res) => {
  try {
    const studentId = req.user.id;
    const stats = await leaveRequestService.getStudentStatistics(studentId);
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getClassStatistics = async (req, res) => {
  try {
    const { classId } = req.params;
    const stats = await leaveRequestService.getClassStatistics(classId);
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
