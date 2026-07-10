import prisma from './src/config/prisma.js';
import * as service from './src/modules/messages/messages.service.js';

async function test() {
  try {
    // Assuming userId 1 and conversationId 7, we just want to see if it hangs
    // Let's find a valid user and conversation first
    const conv = await prisma.conversation.findFirst();
    if (!conv) {
      console.log("No conversations found");
      process.exit(0);
    }
    const participant = await prisma.participant.findFirst({ where: { conversationId: conv.id } });
    if (!participant) {
      console.log("No participants found");
      process.exit(0);
    }
    
    console.log(`Testing with userId=${participant.userId}, convId=${conv.id}`);
    const result = await service.getConversationById(participant.userId, conv.id);
    console.log("Success! Result:", JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

test();
