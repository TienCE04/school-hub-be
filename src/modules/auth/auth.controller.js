import * as service from "./auth.service.js";
import { loginDto } from "./dto/login.dto.js";
import { refreshDto } from "./dto/refresh.dto.js";
import { changePasswordDto } from "./dto/changePassword.dto.js";
import { registerDto } from "./dto/register.dto.js";
import { hashToken } from "../../shared/utils/hash.js";
import * as repo from "./auth.repository.js";

export const login = async (req, res) => {
  try {
    console.log(req.body);
    const data = loginDto(req.body);
    const result = await service.login(data);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const refresh = async (req, res) => {
  try {
    const token = refreshDto(req.body);
    const result = await service.refresh(token);
    res.json(result);
  } catch (e) {
    res.status(401).json({ message: e.message });
  }
};

export const createUser = async (req, res) => {
  try {
    const data = registerDto(req.body);
    const result = await service.createUser(data);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    const data = changePasswordDto(req.body);
    const userId = req.user.id;

    await service.changePassword(userId, data);
    res.json({ message: "Password changed successfully" });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

export const logout = async (req, res) => {
  const token = req.body.refreshToken;
  const hashed = hashToken(token);

  await repo.deleteRefreshToken(hashed);

  res.json({ message: "Logged out" });
};
