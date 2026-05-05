import * as service from "./classes.service.js";
import { createClassDto, createPostDto } from "./dto/class.dto.js";

export const getClassById = async (req, res) => {
  try {
    const result = await service.getClassDetails(parseInt(req.params.id));
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
    const classId = parseInt(req.params.classId);
    const result = await service.getAssignmentStats(postId, classId);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const getAssignments = async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await service.getAssignments(classId, page, limit);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const getClassMembers = async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const result = await service.getClassMembers(classId);
    res.json(result);
  } catch (e) {
    res.status(404).json({ message: e.message });
  }
};
