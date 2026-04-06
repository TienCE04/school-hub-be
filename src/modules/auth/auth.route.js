import express from "express";
import * as controller from "./auth.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";

const router = express.Router();

router.post("/login", controller.login);
router.post("/refresh", controller.refresh);
router.post(
  "/register",
  authenticate,
  authorize(["ADMIN"]),
  controller.createUser,
);
router.post("/change-password", authenticate, controller.changePassword);
router.post("/logout", authenticate, controller.logout);

export default router;
