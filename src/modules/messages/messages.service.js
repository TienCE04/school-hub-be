import * as repo from "./messages.repository.js";
import prisma from "../../config/prisma.js";
import { getIO } from "../../realtime/gateway/index.js";
import { SOCKET_EVENTS } from "../../realtime/events/index.js";
import { sendPushNotification } from "../../shared/utils/fcm.js";

export const getUserConversations = async (userId, skip = 0, take = 30) => {
  const list = await repo.getConversationsByUser(userId, skip, take);

  // Map dữ liệu sang ConversationDto của App
  return Promise.all(
    list.map(async (conv) => {
      const lastMsg = conv.messages[0];
      const myParticipantInfo = conv.participants.find(
        (p) => p.userId === userId,
      );

      // Tính unreadCount: Đếm các tin nhắn tạo sau thời điểm mình đọc lần cuối
      const unreadCount = await repo.countUnread(
        conv.id,
        userId,
        myParticipantInfo.lastReadAt,
      );

      const otherParticipant = conv.participants.find(p => p.userId !== userId);
      const userObj = otherParticipant ? otherParticipant.user : conv.participants[0]?.user;

      const participantUser = userObj ? {
        id: String(userObj.id),
        nameUser: userObj.name || "",
        email: userObj.email || "",
        mssv: userObj.studentCode || "",
        avatar: userObj.avatar || "",
        role: userObj.role || "STUDENT",
        createdAt: userObj.createdAt,
        updatedAt: userObj.updatedAt
      } : null;

      return {
        id: conv.id,
        name: conv.type === "GROUP" ? conv.name : "PRIVATE",
        avatar: conv.avatar,
        type: conv.type,
        participant: participantUser,
        lastMessage: lastMsg
          ? {
            id: lastMsg.id,
            content: lastMsg.content,
            createdAt: lastMsg.createdAt.getTime(),
            sender: lastMsg.sender,
            attachments: lastMsg.attachments,
            isRead: true,
            status: "SENT"
          }
          : null,
        lastTime: lastMsg
          ? lastMsg.createdAt.getTime()
          : conv.updatedAt.getTime(),
        unreadCount,
      };
    }),
  );
};

export const getConversationById = async (userId, conversationId) => {
  const conv = await repo.getConversationById(conversationId);
  if (!conv) {
    throw new Error("Not found");
  }

  const myParticipantInfo = conv.participants.find(
    (p) => p.userId === userId,
  );

  if (!myParticipantInfo) {
    throw new Error("Forbidden");
  }

  const lastMsg = conv.messages && conv.messages.length > 0 ? conv.messages[0] : null;
  const unreadCount = await repo.countUnread(
    conv.id,
    userId,
    myParticipantInfo.lastReadAt,
  );

  const otherParticipant = conv.participants.find(p => p.userId !== userId);
  const userObj = otherParticipant ? otherParticipant.user : conv.participants[0]?.user;

  const participantUser = userObj ? {
    id: String(userObj.id),
    nameUser: userObj.name || "",
    email: userObj.email || "",
    mssv: userObj.studentCode || "",
    avatar: userObj.avatar || "",
    role: userObj.role || "STUDENT",
    createdAt: userObj.createdAt,
    updatedAt: userObj.updatedAt
  } : null;

  return {
    id: conv.id,
    name: conv.type === "GROUP" ? conv.name : "PRIVATE",
    avatar: conv.avatar,
    type: conv.type,
    participant: participantUser,
    lastMessage: lastMsg
      ? {
        id: lastMsg.id,
        content: lastMsg.content,
        createdAt: lastMsg.createdAt.getTime(),
        sender: lastMsg.sender,
        attachments: lastMsg.attachments,
        isRead: true,
        status: "SENT"
      }
      : null,
    lastTime: lastMsg
      ? lastMsg.createdAt.getTime()
      : conv.updatedAt.getTime(),
    unreadCount,
  };
};

export const getOrCreatePrivateConversation = async (userId, receiverId) => {
  const privateKey = [userId, receiverId].sort().join("_");
  let existing = await repo.findPrivateConversation(privateKey);

  if (!existing) {
    existing = await prisma.conversation.create({
      data: {
        type: "PRIVATE",
        privateKey,
        participants: {
          create: Array.from(new Set([userId, receiverId])).map(id => ({ userId: id }))
        }
      }
    });

    try {
      const io = getIO();
      const convData = {
        id: existing.id,
        type: existing.type,
        participants: [userId, receiverId]
      };
      const socketPayload = {
        type: "chat",
        event: "conversation_created",
        data: convData
      };
      io.to(`user:${userId}`).emit(SOCKET_EVENTS.CONVERSATION_CREATED, socketPayload);
      io.to(`user:${receiverId}`).emit(SOCKET_EVENTS.CONVERSATION_CREATED, socketPayload);
    } catch (err) {
      console.error("Socket error on create conversation:", err);
    }
  }

  return existing;
};

export const sendMessage = async (senderId, data) => {
  let convId = data.conversationId;

  // chat 1-1
  if (!convId && data.receiverId) {
    const privateKey = [senderId, data.receiverId].sort().join("_");

    let existing = await repo.findPrivateConversation(privateKey);

    if (!existing) {
      existing = await prisma.conversation.create({
        data: {
          type: "PRIVATE",
          privateKey,
          participants: {
            create: Array.from(new Set([senderId, data.receiverId])).map(id => ({ userId: id }))
          }
        }
      });

      try {
        const io = getIO();
        const convData = {
          id: existing.id,
          type: existing.type,
          participants: [senderId, data.receiverId]
        };
        const socketPayload = {
          type: "chat",
          event: "conversation_created",
          data: convData
        };
        io.to(`user:${senderId}`).emit(SOCKET_EVENTS.CONVERSATION_CREATED, socketPayload);
        io.to(`user:${data.receiverId}`).emit(SOCKET_EVENTS.CONVERSATION_CREATED, socketPayload);
      } catch (err) {
        console.error("Socket error on create conversation:", err);
      }
    }

    convId = existing.id;
  }

  // check permission
  const participant = await prisma.participant.findFirst({
    where: {
      conversationId: convId,
      userId: senderId
    }
  });

  if (!participant) {
    throw new Error("Forbidden");
  }

  // transaction
  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        senderId,
        conversationId: convId,
        content: data.content,
        attachments: data.attachments && data.attachments.length > 0 ? {
          create: data.attachments.map(att => ({
            name: typeof att === 'string' ? att.split('/').pop() : att.name || "Attachment",
            url: typeof att === 'string' ? att : att.url,
            mimeType: typeof att === 'string' ? "application/octet-stream" : att.mimeType || "application/octet-stream",
            size: typeof att === 'string' ? 0 : att.size || 0,
          }))
        } : undefined
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            studentCode: true,
            avatar: true,
            role: true,
            createdAt: true,
            updatedAt: true
          }
        },
        attachments: true
      }
    });

    await tx.conversation.update({
      where: { id: convId },
      data: { updatedAt: new Date() }
    });

    return msg;
  });

  // Fetch all participants to emit socket event
  const allParticipants = await prisma.participant.findMany({
    where: { conversationId: convId }
  });

  try {
    const io = getIO();

    // Format message to match REST API
    const messageDto = {
      ...message,
      createdAt: message.createdAt.getTime(),
      updatedAt: message.updatedAt ? message.updatedAt.getTime() : undefined,
      isRead: true,
      status: "SENT"
    };

    allParticipants.forEach(p => {
      const socketPayload = {
        type: "chat",
        event: "new_message",
        data: messageDto
      };

      // Check if user is connected
      const room = io.sockets.adapter.rooms.get(`user:${p.userId}`);
      if (room && room.size > 0) {
        // User is connected, emit socket event
        io.to(`user:${p.userId}`).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, socketPayload);
      }

      // Always send push notification so the app can save it to local DB.
      if (p.userId !== senderId) {
        sendPushNotification(p.userId, socketPayload);
      }
    });

  } catch (err) {
    console.error("Socket error on sendMessage:", err);
  }

  return messageDto;
};

export const getConversationMessages = async (userId, conversationId, limit = 30, after, before) => {
  // Check if user is a participant
  const participant = await prisma.participant.findUnique({
    where: {
      userId_conversationId: {
        userId,
        conversationId,
      },
    },
  });

  if (!participant) {
    throw new Error("Forbidden");
  }

  const messages = await repo.getMessagesByConversation(conversationId, limit, after, before);

  // Format to match MessageDto
  return messages.map((msg) => ({
    ...msg,
    createdAt: msg.createdAt.getTime(),
    updatedAt: msg.updatedAt ? msg.updatedAt.getTime() : undefined,
    isRead: true,
    status: "SENT"
  }));
};

export const markAsRead = async (userId, conversationId) => {
  // Check if user is a participant
  const participant = await prisma.participant.findUnique({
    where: {
      userId_conversationId: {
        userId,
        conversationId,
      },
    },
  });

  if (!participant) {
    throw new Error("Forbidden");
  }

  await repo.markConversationAsRead(conversationId, userId);

  // Optionally emit a socket event to update the status in the UI
  try {
    const io = getIO();
    const allParticipants = await prisma.participant.findMany({
      where: { conversationId }
    });

    const socketPayload = {
      type: "chat",
      event: "status",
      data: {
        messageId: null, // indicating the whole conversation or last state
        status: "SEEN"
      }
    };

    allParticipants.forEach(p => {
      // Don't send to the one who just read (or you can if you want their UI to sync)
      const room = io.sockets.adapter.rooms.get(`user:${p.userId}`);
      if (room && room.size > 0) {
        io.to(`user:${p.userId}`).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, socketPayload);
      }
    });
  } catch (err) {
    console.error("Socket error on markAsRead:", err);
  }

  return { success: true };
};

export const editMessage = async (userId, messageId, newContent) => {
  const msg = await repo.getMessageById(Number(messageId));
  if (!msg) throw new Error("Not found");
  if (msg.senderId !== userId) throw new Error("Forbidden");

  const updatedMsg = await repo.editMessage(Number(messageId), newContent);

  // Send socket event
  try {
    const io = global.io;
    const conv = await repo.getConversationById(msg.conversationId);
    if (io && conv) {
      const socketPayload = {
        type: "chat",
        event: "MessageEdited",
        data: {
          message: {
            id: String(updatedMsg.id),
            conversationId: String(updatedMsg.conversationId),
            senderId: String(updatedMsg.senderId),
            content: updatedMsg.content,
            isEdited: updatedMsg.isEdited,
            isDeleted: updatedMsg.isDeleted,
            createdAt: updatedMsg.createdAt.getTime(),
            updatedAt: updatedMsg.updatedAt.getTime(),
          }
        }
      };

      conv.participants.forEach(p => {
        io.to(`user:${p.userId}`).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, socketPayload);
      });
    }
  } catch (err) {
    console.error("Socket error on editMessage:", err);
  }

  return updatedMsg;
};

export const deleteMessage = async (userId, messageId) => {
  const msg = await repo.getMessageById(Number(messageId));
  if (!msg) throw new Error("Not found");
  if (msg.senderId !== userId) throw new Error("Forbidden");

  const deletedMsg = await repo.softDeleteMessage(Number(messageId));

  // Send socket event
  try {
    const io = global.io;
    const conv = await repo.getConversationById(msg.conversationId);
    if (io && conv) {
      const socketPayload = {
        type: "chat",
        event: "MessageDeleted",
        data: {
          message: {
            id: String(deletedMsg.id),
            conversationId: String(deletedMsg.conversationId),
            senderId: String(deletedMsg.senderId),
            content: deletedMsg.content,
            isEdited: deletedMsg.isEdited,
            isDeleted: deletedMsg.isDeleted,
            createdAt: deletedMsg.createdAt.getTime(),
            updatedAt: deletedMsg.updatedAt.getTime(),
          }
        }
      };

      conv.participants.forEach(p => {
        io.to(`user:${p.userId}`).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, socketPayload);
      });
    }
  } catch (err) {
    console.error("Socket error on deleteMessage:", err);
  }

  return deletedMsg;
};
