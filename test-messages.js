import prisma from './src/config/prisma.js';
import * as service from './src/modules/messages/messages.service.js';

async function test() {
  try {
    const convId = 7; // User previously checked conv 7
    const participant = await prisma.participant.findFirst({ where: { conversationId: convId } });
    if (!participant) {
      console.log("No participants found for conv 7");
      process.exit(0);
    }
    console.log(`Fetching messages for userId=${participant.userId}, convId=${convId}`);
    const result = await service.getConversationMessages(participant.userId, convId, 0, 50);
    console.log(`Found ${result.length} messages.`);
    if (result.length > 0) {
      console.log("First message:", JSON.stringify(result[0], null, 2));
    }
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

test();
