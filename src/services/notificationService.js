// service/notificationService.js
const prisma = require("../lib/prisma");
const { sendPushNotification } = require("./pushService");

const createNotification = async ({
  userId,
  shipmentId,
  type,
  title,
  message,
  data = {},
}) => {
  return prisma.notification.create({
    data: {
      userId,
      shipmentId,
      type,
      title,
      message,
      data,
    },
  });
};

// Send push notification using expoPushToken from User model
const sendPushNotificationToUser = async (userId, title, body, data = {}) => {
  try {
    // Get user's expoPushToken directly from User model
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true }
    });

    if (!user) {
      console.log(`User ${userId} not found`);
      return { success: false, message: "User not found" };
    }

    if (!user.expoPushToken) {
      console.log(`No expoPushToken found for user ${userId}`);
      return { success: false, message: "No push token found" };
    }

    // Send push notification
    await sendPushNotification(
      user.expoPushToken,
      title,
      body,
      data
    );

    console.log(`✅ Push notification sent to user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error(`Error sending push notification to user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  createNotification,
  sendPushNotificationToUser,
};