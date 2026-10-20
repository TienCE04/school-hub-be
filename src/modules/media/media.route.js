import express from "express";
import * as controller from "./media.controller.js";
import { upload } from "../../config/cloudinary.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";

const router = express.Router();

// Multer/Cloudinary errors happen in middleware, before the controller's
// try/catch. Convert them to the same JSON error shape used by the API.
const parseUpload = (req, res, next) => {
  upload.array("files", 5)(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: error.message || "File upload failed",
      });
    }

    next();
  });
};

router.post(
  "/upload",
  authenticate,
  parseUpload,
  controller.uploadFiles,
);

export default router;
