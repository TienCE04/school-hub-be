import * as service from "./messages.service.js";
import { getUserConversations, sendMessage } from "./messages.service.js";
import { sendMessageDto } from "./dto/messages.dto.js";

export const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const skip = parseInt(req.query.skip) || 0;
    const take = parseInt(req.query.take) || 30;
    const conversations = await service.getUserConversations(userId, skip, take);
    res.json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

export const getConversationById = async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id);
    
    if (!conversationId) {
      return res.status(400).json({ error: "Invalid conversation ID" });
    }

    const conversation = await service.getConversationById(userId, conversationId);
    res.json(conversation);
  } catch (error) {
    console.error("Error fetching conversation by ID:", error);
    if (error.message === "Forbidden" || error.message === "Not found") {
      return res.status(error.message === "Forbidden" ? 403 : 404).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
};

export const getOrCreatePrivateConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const receiverId = parseInt(req.query.receiverId);
    
    if (!receiverId) {
       return res.status(400).json({ error: "receiverId is required" });
    }

    const conversation = await service.getOrCreatePrivateConversation(userId, receiverId);
    res.json({ conversationId: conversation.id });
  } catch (error) {
    console.error("Error get/create private conversation:", error);
    res.status(500).json({ error: "Failed to get/create conversation" });
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
