import * as service from "./classes.service.js";
import { createClassDto, createPostDto } from "./dto/class.dto.js";

export const getClassByCode = async (req, res) => {
  try {
    const classCode = req.params.classCode;
    const result = await service.getClassDetails(classCode);
    res.json(result);
  } catch (e) {
    res.status(404).json({ message: e.message });
  }
};

export const getPostById = async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) {
      return res.status(400).json({ message: "Invalid post ID" });
    }
    const userId = req.user.id;
    const result = await service.getPostById(postId, userId);
    res.json(result);
  } catch (e) {
    res.status(404).json({ message: e.message });
  }
};

export const createNewClass = async (req, res) => {
  try {
    const data = createClassDto(req.body);
    const result = await service.createClass(data, req.user);
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const createNewPost = async (req, res) => {
  try {
    const data = createPostDto(req.body);
    const result = await service.createPost(data, req.user);
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const updatePost = async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID" });
    const result = await service.updatePost(postId, req.body, req.user);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const deletePost = async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID" });
    const result = await service.deletePost(postId, req.user);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const createComment = async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID" });
    const { content, attachments } = req.body;
    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: "Comment must have content or attachments" });
    }
    const result = await service.createComment(postId, req.user, content, attachments);
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);
    if (isNaN(commentId)) return res.status(400).json({ message: "Invalid comment ID" });
    const result = await service.deleteComment(commentId, req.user);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const getAssignmentStats = async (req, res) => {
  try {
    const postId = parseInt(req.params.postId);
    const classCode = req.params.classCode;
    const result = await service.getAssignmentStats(postId, classCode);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const getAssignments = async (req, res) => {
  try {
    const classCode = req.params.classCode;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await service.getAssignments(classCode, page, limit);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const getClassMembers = async (req, res) => {
  try {
    const classCode = req.params.classCode;
    const result = await service.getClassMembers(classCode);
    res.json(result);
  } catch (e) {
    res.status(404).json({ message: e.message });
  }
};

export const getMyClasses = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await service.getMyClasses(userId);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const joinClass = async (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: "Class code is required" });
    }
    const result = await service.joinClassByCode(userId, code);
    res.status(200).json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const getJoinRequests = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { classCode } = req.params;
    const result = await service.getJoinRequests(teacherId, classCode);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const handleJoinRequest = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { classCode, requestId } = req.params;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required (APPROVED or REJECTED)" });
    }
    const result = await service.handleJoinRequest(teacherId, classCode, parseInt(requestId), status);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
