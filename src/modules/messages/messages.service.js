import * as repo from "./messages.repository.js";
import prisma from "../../config/prisma.js";
import { getIO } from "../../realtime/gateway/index.js";
import { SOCKET_EVENTS } from "../../realtime/events/index.js";

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
        attachments: { create: data.attachments }
      },
      include: { sender: true, attachments: true }
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
    allParticipants.forEach(p => {
      io.to(`user:${p.userId}`).emit(SOCKET_EVENTS.MESSAGE_RECEIVED, message);
    });
  } catch (err) {
    console.error("Socket error on sendMessage:", err);
  }

  return message;
};
