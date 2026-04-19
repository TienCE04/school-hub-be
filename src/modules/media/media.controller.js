export const uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new Error("No files uploaded");
    }

    // req.files chứa danh sách file đã upload lên Cloudinary thành công qua Multer
    const attachments = req.files.map((file) => ({
      name: file.originalname,
      url: file.path, // URL từ Cloudinary
      mimeType: file.mimetype,
      size: file.size,
    }));

    // Trả về cho App danh sách thông tin file để App đính kèm vào Post/Assignment sau đó
    res.json(attachments);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
