export const uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new Error("No files uploaded");
    }

    // req.files chứa danh sách file đã upload lên Cloudinary thành công qua Multer
    const attachments = req.files.map((file) => {
      const url = file.path || file.secure_url || file.url;
      if (!url) {
        throw new Error("Upload returned no file URL");
      }

      return {
        name: file.originalname || file.filename || "uploaded_file",
        url, // URL từ Cloudinary
        mimeType: file.mimetype || "application/octet-stream",
        size: file.size || 0,
      };
    });

    // Trả về cho App danh sách thông tin file để App đính kèm vào Post/Assignment sau đó
    res.json(attachments);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
