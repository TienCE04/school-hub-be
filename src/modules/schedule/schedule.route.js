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
  "/:semesterId",
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

// ADD subject to semester (ADMIN)
router.post(
  "/:semesterId/subjects",
  authenticate,
  authorize(["ADMIN"]),
  controller.addSubjectToSemester
);

export default router;