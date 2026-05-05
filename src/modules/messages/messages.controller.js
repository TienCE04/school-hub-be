import * as service from "./messages.service.js";
import { getUserConversations, sendMessage } from "./messages.service.js";
import { sendMessageDto } from "./dto/messages.dto.js";

export const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversations = await service.getUserConversations(userId);
    res.json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

export const postMessage = async (req, res) => {
  try {
    const data = sendMessageDto(req.body);
    const result = await service.sendMessage(req.user.id, data);

    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({
      message: e.message || "Internal error",
    });
  }
};
