import * as service from "./assignments.service.js";
import {
  createAssignmentDto,
  submitAssignmentDto,
  gradeSubmissionDto,
} from "./dto/assignment.dto.js";

export const createAssignment = async (req, res) => {
  try {
    const data = createAssignmentDto(req.body);
    const result = await service.createAssignment(req.user.id, data);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export const getStudentAssignmentDetail = async (req, res) => {
  try {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }
    const result = await service.getStudentAssignmentDetail(req.user.id, postId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export const getTeacherAssignmentDetail = async (req, res) => {
  try {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }
    const result = await service.getTeacherAssignmentDetail(req.user.id, postId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export const submitAssignment = async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }
    const data = submitAssignmentDto(req.body);
    const result = await service.submitAssignment(
      req.user.id,
      postId,
      data.attachments,
    );
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export const gradeSubmission = async (req, res) => {
  try {
    const submissionId = parseInt(req.params.id);
    if (isNaN(submissionId)) {
      return res.status(400).json({ error: "Invalid submission ID" });
    }
    const data = gradeSubmissionDto(req.body);
    const result = await service.gradeSubmission(
      req.user.id,
      submissionId,
      data,
    );
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export const getMySubmissions = async (req, res) => {
  try {
    const result = await service.getMySubmissions(req.user.id);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export const getMyTasks = async (req, res) => {
  try {
    const result = await service.getMyTasks(req.user.id);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
