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
