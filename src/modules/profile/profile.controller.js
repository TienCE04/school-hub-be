import * as service from "./profile.service.js";
import { updateProfileDto } from "./dto/profile.dto.js";

export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await service.getProfile(userId);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const data = updateProfileDto(req.body);
    const result = await service.updateProfile(userId, data);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
