import express from "express";
import * as controller from "./schedule.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";

const router = express.Router();

// GET all semesters
router.get(
  "/",
  authenticate,
  controller.getAllSemesters
);

// GET semester detail + subjects
router.get(
  "/my",
  authenticate,
  controller.getSemesterDetails
);

// CREATE semester (ADMIN only)
router.post(
  "/",
  authenticate,
  authorize(["ADMIN"]),
  controller.createSemester
);

// UPDATE semester (ADMIN only)
router.put(
  "/semesters/:id",
  authenticate,
  authorize(["ADMIN"]),
  controller.updateSemester
);

// DELETE semester (ADMIN only)
router.delete(
  "/semesters/:id",
  authenticate,
  authorize(["ADMIN"]),
  controller.deleteSemester
);

// ADMIN subject/schedule management
router.get(
  "/semesters/:semesterId/subjects",
  authenticate,
  authorize(["ADMIN"]),
  controller.getAdminSubjects
);

router.post(
  "/semesters/:semesterId/import",
  authenticate,
  authorize(["ADMIN"]),
  controller.importStudentSchedules,
);

// ADD subject to semester (ADMIN)
router.post(
  "/:semesterId/subjects",
  authenticate,
  authorize(["ADMIN"]),
  controller.addSubjectToSemester
);

router.put(
  "/subjects/:id",
  authenticate,
  authorize(["ADMIN"]),
  controller.updateSubject
);

router.delete(
  "/subjects/:id",
  authenticate,
  authorize(["ADMIN"]),
  controller.deleteSubject
);

export default router;
