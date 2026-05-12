import * as service from "../schedule/schedule.service.js";
import { createSemesterDto, createSubjectDto } from "../schedule/dto/semester.dto.js";

export const getSemesterDetails = async (req, res) => {
  try {

    const userId = req.user.id;
    const semesterId = req.query.semesterId ? Number(req.query.semesterId) : undefined;

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
