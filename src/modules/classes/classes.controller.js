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
    const result = await service.createClass(data);
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
