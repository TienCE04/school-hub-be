import express from "express";
import * as controller from "./users.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";

const router = express.Router();

// GET /api/users/search?query=xxx
router.get("/search", authenticate, controller.searchUsers);

// FCM token routes must be registered before the dynamic /:id routes.
router.post("/fcm-token", authenticate, controller.saveFcmToken);
router.delete("/fcm-token", authenticate, controller.deleteFcmToken);

// GET /api/users
router.get("/", authenticate, authorize(["ADMIN"]), controller.getAllUsers);
router.post("/", authenticate, authorize(["ADMIN"]), controller.createUser);

// GET /api/users/:id
router.get("/:id", authenticate, authorize(["ADMIN"]), controller.getUserById);

// PUT /api/users/:id
router.put("/:id", authenticate, authorize(["ADMIN"]), controller.updateUser);

// POST /api/users/:id/reset-password
router.post("/:id/reset-password", authenticate, authorize(["ADMIN"]), controller.resetPassword);

// DELETE /api/users/:id
router.delete("/:id", authenticate, authorize(["ADMIN"]), controller.deleteUser);

export default router;
