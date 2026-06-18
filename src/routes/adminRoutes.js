const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleMiddleware");

const {
  getAllDrivers,
  getPendingDrivers,
  approveDriver,
  rejectDriver,
  getAllUsers,
  getUserById,
  updateDriverStatus,
  updateUserStatus,
  addAdmin,
  removeAdmin,
  getAllAdmins,
} = require("../controllers/adminController");





// GET ALL DRIVERS
router.post("/add-admin",protect,roleGuard(["SUPER_ADMIN"]), addAdmin);
router.get("/drivers",protect,roleGuard(["SUPER_ADMIN"]), getAllDrivers);
router.get("/all",protect,roleGuard(["SUPER_ADMIN"]), getAllUsers);
router.post("/:id",protect,roleGuard(["SUPER_ADMIN"]), getUserById);
router.patch("/updateDriverStatus/:id/status",protect,roleGuard(["SUPER_ADMIN"]), updateDriverStatus);
router.patch("/updateUserStatus/:id/status",protect,roleGuard(["SUPER_ADMIN"]), updateUserStatus);

// GET PENDING DRIVERS
router.get("/drivers/pending", getPendingDrivers);

// APPROVE DRIVER
router.put("/drivers/approve/:driverId", approveDriver);

// REJECT DRIVER
router.delete("/drivers/reject/:driverId", rejectDriver);

module.exports = router;