import * as driveService from "./drive.service.js";

export const getStorageUsage = async (req, res) => {
  try {
    const usage = await driveService.getStorageUsage(req.user.id);
    res.json(usage);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const uploadFile = async (req, res) => {
  try {
    const data = req.body;
    const file = await driveService.uploadFile(req.user.id, data);
    res.status(201).json(file);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const listPersonalFiles = async (req, res) => {
  try {
    const files = await driveService.listPersonalFiles(req.user.id);
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const listClassSharedFiles = async (req, res) => {
  try {
    const { classId } = req.params;
    const files = await driveService.listClassSharedFiles(parseInt(classId, 10));
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    await driveService.deleteFile(req.user.id, parseInt(id, 10));
    res.status(204).send();
  } catch (err) {
    res.status(403).json({ message: err.message });
  }
};
