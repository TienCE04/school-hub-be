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

export const getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id);
    const skip = parseInt(req.query.skip) || 0;
    const take = parseInt(req.query.take) || 50;

    const messages = await service.getConversationMessages(userId, conversationId, skip, take);
    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    if (error.message === "Forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id);

    const result = await service.markAsRead(userId, conversationId);
    res.json(result);
  } catch (error) {
    console.error("Error marking messages as read:", error);
    if (error.message === "Forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
};
