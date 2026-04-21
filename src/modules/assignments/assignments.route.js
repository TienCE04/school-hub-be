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
  authorize("TEACHER", "ADMIN"),
  controller.createAssignment,
);

/**
 * GET ASSIGNMENT DETAIL
 * Student / Teacher đều xem được
 * GET /assignments/:id
 */
router.get("/:id", authenticate, controller.getAssignmentDetail);

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

export default router;
