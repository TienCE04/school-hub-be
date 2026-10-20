import * as service from "./users.service.js";

export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Vui lòng cung cấp từ khóa tìm kiếm (query)" });
    }
    const result = await service.searchUsers(query);
    res.json(result);
  } catch (e) {
    console.error("Error searching users:", e);
    res.status(500).json({ message: e.message || "Internal server error" });
  }
};

export const saveFcmToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "FCM token is required" });
    }

    await service.saveFcmToken(userId, token);
    res.status(200).json({ message: "FCM token saved successfully" });
  } catch (error) {
    console.error("Error saving FCM token:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
};

export const deleteFcmToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "FCM token is required" });
    }

    await service.deleteFcmToken(userId, token);
    res.status(200).json({ message: "FCM token deleted successfully" });
  } catch (error) {
    console.error("Error deleting FCM token:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const role = req.query.role ? String(req.query.role) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;

    const result = await service.getAllUsers(page, limit, role, search);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message || "Failed to load users" });
  }
};

export const createUser = async (req, res) => {
  try {
    const result = await service.createUser(req.body);
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ message: e.message || "Failed to create user" });
  }
};

export const getUserById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });

    const result = await service.getUserById(id);
    res.json(result);
  } catch (e) {
    res.status(404).json({ message: e.message || "User not found" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });

    const result = await service.updateUser(id, req.body, req.user.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message || "Failed to update user" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    await service.resetPassword(id, newPassword);
    res.json({ message: "Password reset successfully" });
  } catch (e) {
    res.status(400).json({ message: e.message || "Failed to reset password" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });

    await service.deleteUser(id, req.user.id);
    res.json({ message: "User deleted successfully" });
  } catch (e) {
    res.status(400).json({ message: e.message || "Failed to delete user" });
  }
};
