import prisma from "../../config/prisma.js";

export const getConversationsByUser = (userId, skip = 0, take = 30) => {
  return prisma.conversation.findMany({
    where: {
      participants: { some: { userId } },
    },
    include: {
      participants: {
        select: { 
          userId: true, 
          lastReadAt: true,
          user: {
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
          }
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
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
            },
          },
          attachments: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    skip,
    take,
  });
};

export const getConversationById = (conversationId) => {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        select: { 
          userId: true, 
          lastReadAt: true,
          user: {
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
          }
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
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
            },
          },
          attachments: true,
        },
      },
    },
  });
};

export const createMessage = (
  senderId,
  conversationId,
  content,
  attachments,
) => {
  return prisma.message.create({
    data: {
      senderId,
      conversationId,
      content,
      attachments: attachments && attachments.length > 0 ? {
        create: attachments.map(att => ({
          name: typeof att === 'string' ? att.split('/').pop() : att.name || "Attachment",
          url: typeof att === 'string' ? att : att.url,
          mimeType: typeof att === 'string' ? "application/octet-stream" : att.mimeType || "application/octet-stream",
          size: typeof att === 'string' ? 0 : att.size || 0,
        }))
      } : undefined
    },
    include: { sender: true, attachments: true },
  });
};

export const findPrivateConversation = (privateKey) => {
  return prisma.conversation.findUnique({
    where: { privateKey },
  });
};

export const countUnread = (conversationId, userId, lastReadAt) => {
  return prisma.message.count({
    where: {
      conversationId,
      createdAt: { gt: lastReadAt },
      senderId: { not: userId }
    }
  });
};

export const getMessagesByConversation = (conversationId, limit = 30, after, before) => {
  const whereClause = { conversationId };

  if (after) {
    whereClause.updatedAt = { gt: new Date(after) }; // Sync logic uses updatedAt
  } else if (before) {
    whereClause.createdAt = { lt: new Date(before) }; // Paging history uses createdAt
  }

  return prisma.message.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: limit,
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
        },
      },
      attachments: true,
    },
  });
};

export const markConversationAsRead = (conversationId, userId) => {
  return prisma.participant.update({
    where: {
      userId_conversationId: {
        userId,
        conversationId,
      },
    },
    data: {
      lastReadAt: new Date(),
    },
  });
};

export const getMessageById = (messageId) => {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          email: true,
          studentCode: true,
          avatar: true,
          role: true,
        },
      },
      attachments: true,
    },
  });
};

export const editMessage = (messageId, newContent) => {
  return prisma.message.update({
    where: { id: messageId },
    data: {
      content: newContent,
      isEdited: true,
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
        },
      },
      attachments: true,
    },
  });
};

export const softDeleteMessage = (messageId) => {
  return prisma.message.update({
    where: { id: messageId },
    data: {
      isDeleted: true,
      content: "", // Optionally clear content, or leave it and let frontend handle
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
        },
      },
      attachments: true,
    },
  });
};