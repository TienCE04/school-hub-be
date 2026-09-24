import { getFirebaseAdmin } from '../../config/firebase.js';
import prisma from '../../config/prisma.js';

/**
 * Maps the generic socket payload to the flat data map expected by Android app
 */
const mapPayloadToAndroidData = async (payload) => {
  const data = {
    notificationId: Date.now().toString(),
    createdAt: Date.now().toString()
  };

  if (payload.type === 'chat' && ['new_message', 'message_received'].includes(payload.event) && payload.data) {
    data.type = "Message";
    data.title = payload.data.sender?.name || "New Message";
    data.content = payload.data.content || "You received a new message";
    data.avatar = payload.data.sender?.avatar || "";
    if (payload.data.conversationId) data.conversationId = payload.data.conversationId.toString();
  } else if (payload.type === 'post' && payload.data) {
    data.type = "Post";
    data.title = "New Post";
    data.content = "A new post was added to your class";
    if (payload.data.postId) data.postId = payload.data.postId.toString();
    
    if (payload.data.classCode) {
      data.classCode = payload.data.classCode;
    } else {
      const classId = payload.data.groupId || payload.data.classId;
      if (classId) {
        const classObj = await prisma.class.findUnique({ where: { id: Number(classId) } });
        if (classObj) data.classCode = classObj.code;
      }
    }
  } else if (payload.type === 'assignment' && payload.data) {
    data.type = "Assignment";
    data.title = "New Assignment";
    data.content = "A new assignment was posted in your class";
    if (payload.data.assignmentId) data.assignmentId = payload.data.assignmentId.toString();
    
    // Fetch classCode
    const classId = payload.data.groupId || payload.data.classId;
    if (classId) {
      const classObj = await prisma.class.findUnique({ where: { id: Number(classId) } });
      if (classObj) data.classCode = classObj.code;
    }
  } else if (payload.type === 'notification' && payload.data) {
    data.type = "University";
    data.title = payload.data.title || "New Notification";
    data.content = payload.data.content || "";
  } else {
    data.type = "University";
    data.title = "Notification";
    data.content = "";
  }

  // Ensure all values are strings! FCM doesn't allow nested objects or non-string values
  Object.keys(data).forEach(key => {
    if (data[key] !== null && data[key] !== undefined) {
      data[key] = String(data[key]);
    } else {
      delete data[key];
    }
  });

  return data;
};

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

    // Build the data payload required by the Android app
    const fcmData = await mapPayloadToAndroidData(payload);

    const message = {
      data: fcmData,
      tokens: tokens, // Multicast message
    };

    // Note: We deliberately omit the "notification" block here. 
    // Sending only "data" ensures that Android's onMessageReceived is ALWAYS triggered
    // even when the app is in the background, allowing the app to save the notification to the local DB.

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

    const fcmData = await mapPayloadToAndroidData(payload);

    const message = {
      data: fcmData,
      tokens: tokens,
    };

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
