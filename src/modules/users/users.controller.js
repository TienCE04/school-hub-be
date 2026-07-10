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
