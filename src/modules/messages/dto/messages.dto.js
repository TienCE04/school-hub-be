export const sendMessageDto = (data) => {
  const { conversationId, content, attachments, receiverId } = data;

  if (!conversationId && !receiverId) {
    throw new Error("Conversation ID or Receiver ID is required");
  }

  if (!content && (!attachments || attachments.length === 0)) {
    throw new Error("Message must have content or attachment");
  }

  return {
    conversationId: conversationId ? Number(conversationId) : null,
    receiverId: receiverId ? Number(receiverId) : null,
    content: content?.trim() || "",
    attachments: Array.isArray(attachments) ? attachments : []
  };
};