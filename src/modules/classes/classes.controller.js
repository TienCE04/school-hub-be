import * as service from "./classes.service.js";
import { createClassDto, createPostDto } from "./dto/class.dto.js";

export const getClassByCode = async (req, res) => {
  try {
    const classCode = req.params.classCode;
    const result = await service.getClassDetails(classCode, req.user);
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
    const result = await service.getAssignmentStats(postId, classCode, req.user);
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

    const result = await service.getAssignments(classCode, page, limit, req.user);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const getClassMembers = async (req, res) => {
  try {
    const classCode = req.params.classCode;
    const result = await service.getClassMembers(classCode, req.user);
    res.json(result);
  } catch (e) {
    res.status(404).json({ message: e.message });
  }
};

export const getClassRosterPage = async (req, res) => {
  try {
    const result = await service.getClassRosterPage(
      req.params.classCode,
      req.user,
      Number.parseInt(req.query.page, 10) || 1,
      Number.parseInt(req.query.limit, 10) || 20,
      req.query.search,
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
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

export const getAllClasses = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const search = req.query.search ? String(req.query.search) : "";
    res.json(await service.getAllClasses(page, limit, search));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const updateClass = async (req, res) => {
  try {
    const classId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class ID" });
    res.json(await service.updateClass(classId, req.body, req.user));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const deleteClass = async (req, res) => {
  try {
    const classId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class ID" });
    await service.deleteClass(classId);
    res.json({ message: "Class deleted successfully" });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const manageClassMembers = async (req, res) => {
  try {
    const classId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class ID" });
    res.json(await service.manageClassMembers(classId, req.body));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const getAdminClassMembers = async (req, res) => {
  try {
    const classId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class ID" });
    const result = await service.getAdminClassMembers(
      classId,
      Number.parseInt(req.query.page, 10) || 1,
      Number.parseInt(req.query.limit, 10) || 20,
      req.query.search,
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const getAvailableClassStudents = async (req, res) => {
  try {
    const classId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(classId)) return res.status(400).json({ message: "Invalid class ID" });
    res.json({ users: await service.getAvailableClassStudents(classId, req.query.search) });
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
    const { classCode } = req.params;
    const result = await service.getJoinRequests(req.user, classCode);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const handleJoinRequest = async (req, res) => {
  try {
    const { classCode, requestId } = req.params;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required (APPROVED or REJECTED)" });
    }
    const result = await service.handleJoinRequest(req.user, classCode, parseInt(requestId), status);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
