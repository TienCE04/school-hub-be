import express from "express";
import * as controller from "./users.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";

const router = express.Router();

// GET /api/users/search?query=xxx
router.get("/search", authenticate, controller.searchUsers);

// POST /api/users/fcm-token
router.post("/fcm-token", authenticate, controller.saveFcmToken);

// DELETE /api/users/fcm-token
router.delete("/fcm-token", authenticate, controller.deleteFcmToken);

export default router;
