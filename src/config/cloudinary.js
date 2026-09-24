// Load .env before this module configures Cloudinary. ESM evaluates imported
// modules before the body of server.js, so loading dotenv only in server.js is
// too late for this configuration module.
import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
};

if (Object.values(cloudinaryConfig).some((value) => !value)) {
  console.warn("Cloudinary is not fully configured; media uploads will fail until CLOUDINARY_* variables are set.");
}

cloudinary.config(cloudinaryConfig);

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "school-hub-attachments",
    resource_type: "auto",
  },
});

export const upload = multer({ storage });
