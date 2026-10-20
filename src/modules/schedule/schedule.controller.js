import * as service from "../schedule/schedule.service.js";
import { createSemesterDto, createSubjectDto, updateSubjectDto } from "../schedule/dto/semester.dto.js";

export const getSemesterDetails = async (req, res) => {
  try {

    const userId = req.user.id;
    const semesterId = req.query.semesterId ? Number(req.query.semesterId) : undefined;

    console.log("schedule.controller.js GET /my called", { query: req.query, parsedSemesterId: semesterId });

    const result = await service.getSemesterDetails(userId, semesterId);

    res.status(200).json(
      result
    );
  } catch (err) {
    res.status(400).json({
      message: err.message
    });
  }
};

export const getAllSemesters = async (req, res) => {
  try {
    const result = await service.getAllSemesters();

    res.status(200).json(
      result
    );
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};


export const createSemester = async (req, res) => {
  try {
    const dto = createSemesterDto(req.body);

    const result = await service.createSemester(dto);

    res.status(201).json(
      result
    );
  } catch (err) {
    res.status(400).json({
      message: err.message
    });
  }
};

export const updateSemester = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid semester ID" });
    const result = await service.updateSemester(id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const deleteSemester = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid semester ID" });
    await service.deleteSemester(id);
    res.json({ message: "Semester deleted successfully" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const getAdminSubjects = async (req, res) => {
  try {
    const semesterId = Number.parseInt(req.params.semesterId, 10);
    if (Number.isNaN(semesterId)) return res.status(400).json({ message: "Invalid semester ID" });
    const result = await service.getAdminSubjects(semesterId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const importStudentSchedules = async (req, res) => {
  try {
    const semesterId = Number.parseInt(req.params.semesterId, 10);
    if (Number.isNaN(semesterId)) return res.status(400).json({ message: "Invalid semester ID" });
    const result = await service.importStudentSchedules(semesterId, req.body?.rows);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};


export const addSubjectToSemester = async (req, res) => {
  try {
    const { semesterId } = req.params;

    const dto = createSubjectDto(req.body);

    const result = await service.addSubjectToSemester(
      Number(semesterId),
      dto
    );

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({
      message: err.message
    });
  }
};

export const updateSubject = async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid subject ID" });
    const result = await service.updateSubject(id, updateSubjectDto(req.body));
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const deleteSubject = async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid subject ID" });
    await service.deleteSubject(id);
    res.json({ message: "Subject deleted successfully" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
