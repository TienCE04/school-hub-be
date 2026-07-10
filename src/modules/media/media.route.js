import express from "express";
import * as controller from "./media.controller.js";
import { upload } from "../../config/cloudinary.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/upload",
  authenticate,
  upload.array("files", 5),
  controller.uploadFiles,
);

export default router;
