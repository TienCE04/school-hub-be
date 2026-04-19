import * as service from "../schedule/schedule.service.js";
import { createSemesterDto,createSubjectDto } from "../schedule/dto/semester.dto.js";

export const getSemesterDetails = async (req, res) => {
  try {
    const { semesterId } = req.params;

    const result = await service.getSemesterDetails(Number(semesterId));

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

export const getAllSemesters = async (req, res) => {
  try {
    const result = await service.getAllSemesters();

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


export const createSemester = async (req, res) => {
  try {
    const dto = createSemesterDto(req.body);

    const result = await service.createSemester(dto);

    res.status(201).json({
      success: true,
      message: "Semester created successfully",
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
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

    res.status(201).json({
      success: true,
      message: "Subject added successfully",
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};