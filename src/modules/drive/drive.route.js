import { Router } from "express";
import * as driveController from "./drive.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/usage", driveController.getStorageUsage);
router.post("/upload", driveController.uploadFile);
router.get("/personal", driveController.listPersonalFiles);
router.get("/class/:classId", driveController.listClassSharedFiles);
router.delete("/:id", driveController.deleteFile);

export default router;
