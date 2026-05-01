import express from "express";
import * as controller from "./profile.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";

const router = express.Router();

// GET /api/profile/me
router.get("/me", authenticate, controller.getMyProfile);

// PATCH /api/profile/me
router.patch("/me", authenticate, controller.updateMyProfile);

export default router;
