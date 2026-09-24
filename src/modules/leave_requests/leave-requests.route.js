import express from "express";
import * as controller from "./leave-requests.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";

const router = express.Router();

router.post("/", authenticate, controller.createLeaveRequest);
router.get("/my-requests", authenticate, controller.getMyRequests);
router.get("/class/:classId", authenticate, authorize(["TEACHER", "ADMIN"]), controller.getClassRequests);
router.patch("/:id/status", authenticate, authorize(["TEACHER", "ADMIN"]), controller.updateStatus);
router.get("/statistics/my", authenticate, controller.getMyStatistics);
router.get("/statistics/class/:classId", authenticate, authorize(["TEACHER", "ADMIN"]), controller.getClassStatistics);

export default router;
