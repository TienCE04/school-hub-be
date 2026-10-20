import express from "express";
import * as controller from "./assignments.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";

const router = express.Router();

/**
 * =========================
 * ASSIGNMENT ROUTES
 * =========================
 */

/**
 * CREATE ASSIGNMENT
 * Only TEACHER / ADMIN
 * POST /assignments
 */
router.post(
  "/",
  authenticate,
  authorize(["TEACHER", "ADMIN"]),
  controller.createAssignment,
);

/**
 * GET MY TASKS (student dashboard)
 * Upcoming, past due, submitted
 * Only STUDENT
 * GET /assignments/my-tasks
 */
router.get(
  "/my-tasks",
  authenticate,
  authorize(["STUDENT"]),
  controller.getMyTasks,
);

/**
 * GET MY SUBMISSIONS (student dashboard)
 * Only STUDENT
 * GET /assignments/my-submissions
 */
router.get(
  "/my-submissions",
  authenticate,
  authorize(["STUDENT"]),
  controller.getMySubmissions,
);

/**
 * GET STUDENT ASSIGNMENT DETAIL
 * Returns one task plus the current student's submission.
 * GET /assignments/:id/student-detail
 */
router.get(
  "/:id/student-detail",
  authenticate,
  authorize(["STUDENT"]),
  controller.getStudentAssignmentDetail,
);

/**
 * GET TEACHER ASSIGNMENT DETAIL
 * Returns assignment summary, statistics and all student submissions.
 * GET /assignments/:id/teacher-detail
 */
router.get(
  "/:id/teacher-detail",
  authenticate,
  authorize(["TEACHER", "ADMIN"]),
  controller.getTeacherAssignmentDetail,
);

/**
 * SUBMIT ASSIGNMENT
 * Only STUDENT
 * POST /assignments/:id/submit
 */
router.post(
  "/:id/submit",
  authenticate,
  authorize(["STUDENT"]),
  controller.submitAssignment,
);

/**
 * GRADE SUBMISSION
 * Only TEACHER / ADMIN
 * POST /assignments/submissions/:id/grade
 */
router.post(
  "/submissions/:id/grade",
  authenticate,
  authorize(["TEACHER", "ADMIN"]),
  controller.gradeSubmission,
);

export default router;
