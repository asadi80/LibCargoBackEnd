const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { protect } = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleMiddleware");
const { getNotifications, markAsRead, markAllAsRead, deleteNotification } = require("../controllers/notificationController");

// ✅ SPECIFIC routes first, PARAMETERIZED routes last

// GET /api/notifications
router.get('/', protect, roleGuard(["CUSTOMER"]), async (req, res) => {
  try {
    const { limit = 20, offset = 0, unreadOnly = false } = req.query;
    const result = await getNotifications(req.user.id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      unreadOnly: unreadOnly === 'true',
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/notifications/unread/count  ← must be before /:id routes
router.get('/unread/count', protect, roleGuard(["CUSTOMER"]), async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false }
    });
    res.json({ success: true, unreadCount: count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/notifications/push-token  ← also specific, keep before /:id
router.post("/push-token", protect, roleGuard(["CUSTOMER"]), async (req, res) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken) return res.status(400).json({ success: false, message: "Push token is required" });
    await prisma.user.update({ where: { id: req.user.id }, data: { expoPushToken: pushToken } });
    res.json({ success: true, message: "Push token updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/notifications/read-all  ← must be before /:id/read
router.put('/read-all', protect, roleGuard(["CUSTOMER"]), async (req, res) => {
  try {
    const result = await markAllAsRead(req.user.id);
    res.json({ success: true, count: result.count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/notifications/:id/read  ← parameterized, after /read-all
router.put('/:id/read', protect, roleGuard(["CUSTOMER"]), async (req, res) => {
  try {
    const notification = await markAsRead(req.params.id, req.user.id);
    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', protect, roleGuard(["CUSTOMER"]), async (req, res) => {
  try {
    await deleteNotification(req.params.id, req.user.id);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


module.exports = router;