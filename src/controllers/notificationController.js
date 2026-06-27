//controller/notificatonController.js

const prisma = require("../lib/prisma");

const getNotifications = async (userId, options = {}) => {
  const { limit = 20, offset = 0, unreadOnly = false } = options;
  
  const where = {
    userId,
    ...(unreadOnly && { isRead: false })
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        shipment: {
          select: {
            id: true,
            status: true,
            pickupAddr: true,
            deliveryAddr: true,
          }
        }
      }
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    })
  ]);

  return {
    notifications,
    total,
    unreadCount,
    hasMore: offset + notifications.length < total
  };
};


// Mark a notification as read
const markAsRead = async (notificationId, userId) => {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId }
  });

  if (!notification) {
    throw new Error('Notification not found');
  }

  if (notification.userId !== userId) {
    throw new Error('Unauthorized to mark this notification as read');
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true }
  });
};

// Mark all notifications as read
const markAllAsRead = async (userId) => {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false
    },
    data: { isRead: true }
  });

  return { count: result.count };
};

// Delete a notification
const deleteNotification = async (notificationId, userId) => {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId }
  });

  if (!notification) {
    throw new Error('Notification not found');
  }

  if (notification.userId !== userId) {
    throw new Error('Unauthorized to delete this notification');
  }

  return prisma.notification.delete({
    where: { id: notificationId }
  });
};



module.exports = {
 getNotifications,
 markAsRead,
 markAllAsRead,
 deleteNotification
};
