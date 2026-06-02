import * as repo from "./messages.repository.js";
import prisma from "../../config/prisma.js";
import { getIO } from "../../realtime/gateway/index.js";
import { SOCKET_EVENTS } from "../../realtime/events/index.js";
import { sendPushNotification } from "../../shared/utils/fcm.js";

export const getUserConversations = async (userId) => {
  const list = await repo.getConversationsByUser(userId);

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

      return {
        id: conv.id,
        name: conv.type === "GROUP" ? conv.name : "PRIVATE",
        avatar: conv.avatar,
        type: conv.type,
        lastMessage: lastMsg
          ? {
            id: lastMsg.id,
            content: lastMsg.content,
            createdAt: lastMsg.createdAt.getTime(),
            sender: lastMsg.sender,
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
            create: [
              { userId: senderId },
              { userId: data.receiverId }
            ]
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
        io.to(`user:${senderId}`).emit(SOCKET_EVENTS.CONVERSATION_CREATED, convData);
        io.to(`user:${data.receiverId}`).emit(SOCKET_EVENTS.CONVERSATION_CREATED, convData);
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
      } else {
        // User is not connected, send push notification
        // Note: We don't send push notification to the sender (unless they disconnected midway, but even then, it's their own message)
        if (p.userId !== senderId) {
          sendPushNotification(p.userId, socketPayload);
        }
      }
    });

  } catch (err) {
    console.error("Socket error on sendMessage:", err);
  }

  return messageDto;
};

export const getConversationMessages = async (userId, conversationId, skip = 0, take = 50) => {
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

  const messages = await repo.getMessagesByConversation(conversationId, skip, take);

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
