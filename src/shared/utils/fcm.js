import { getFirebaseAdmin } from '../../config/firebase.js';
import prisma from '../../config/prisma.js';

/**
 * Sends an FCM push notification to a user's devices
 * @param {number} userId - The ID of the user to send the notification to
 * @param {object} payload - The JSON payload representing the event
 */
export const sendPushNotification = async (userId, payload) => {
  const admin = getFirebaseAdmin();
  if (!admin) {
    // Firebase not configured, silently skip
    return;
  }

  try {
    // Find all device tokens for the user
    const deviceTokens = await prisma.deviceToken.findMany({
      where: { userId: Number(userId) },
      select: { token: true }
    });

    if (!deviceTokens || deviceTokens.length === 0) {
      return; // No devices registered
    }

    const tokens = deviceTokens.map(dt => dt.token);

    // Prepare message
    // App expects JSON string in FCM data payload or specific fields.
    // FCM data payload only accepts string values, so we stringify nested objects.
    const message = {
      data: {
        eventPayload: JSON.stringify(payload)
      },
      tokens: tokens, // Multicast message
    };

    // If it's a chat message or notification, we can also add a Notification payload for system tray
    if (payload.type === 'chat' && payload.event === 'new_message' && payload.data) {
      message.notification = {
        title: 'New Message',
        body: payload.data.content || 'You received a new message'
      };
    } else if (payload.type === 'notification' && payload.data) {
      message.notification = {
        title: payload.data.title || 'New Notification',
        body: payload.data.content || ''
      };
    }

    // Send the message
    const response = await admin.messaging().sendEachForMulticast(message);
    
    // Clean up invalid tokens (e.g. uninstalled app)
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        if (
          errCode === 'messaging/invalid-registration-token' ||
          errCode === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await prisma.deviceToken.deleteMany({
        where: { token: { in: invalidTokens } }
      });
      console.log(`Cleaned up ${invalidTokens.length} invalid FCM tokens for user ${userId}`);
    }

  } catch (error) {
    console.error(`Failed to send push notification to user ${userId}:`, error);
  }
};

/**
 * Sends an FCM push notification to multiple users
 * @param {number[]} userIds - Array of user IDs
 * @param {object} payload - The JSON payload
 */
export const sendPushNotificationToUsers = async (userIds, payload) => {
  const admin = getFirebaseAdmin();
  if (!admin || !userIds || userIds.length === 0) return;

  try {
    const deviceTokens = await prisma.deviceToken.findMany({
      where: { userId: { in: userIds.map(Number) } },
      select: { token: true }
    });

    if (!deviceTokens || deviceTokens.length === 0) return;

    const tokens = deviceTokens.map(dt => dt.token);

    const message = {
      data: {
        eventPayload: JSON.stringify(payload)
      },
      tokens: tokens,
    };

    if (payload.type === 'post' && payload.data) {
      message.notification = {
        title: 'New Post',
        body: 'A new post was added to your class'
      };
    } else if (payload.type === 'assignment' && payload.data) {
      message.notification = {
        title: 'New Assignment',
        body: 'A new assignment was posted in your class'
      };
    }

    const response = await admin.messaging().sendEachForMulticast(message);

    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        if (
          errCode === 'messaging/invalid-registration-token' ||
          errCode === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await prisma.deviceToken.deleteMany({
        where: { token: { in: invalidTokens } }
      });
    }
  } catch (error) {
    console.error(`Failed to send multicast push notification:`, error);
  }
};
