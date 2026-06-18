const express = require("express");
const router = express.Router();

const requireApprovedDriver = require("../middleware/driverApproval");
const roleGuard = require("../middleware/roleMiddleware");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const {
  createDriverProfile,
  uploadDocuments,
  updateLocation,
  getDriverProfile,
  updateDriverProfile,
  updateVehicleInfo,
  updateDriverStatus,
  getNearbyDrivers,    // Add this
  getOnlineDrivers,
  getDriverById,
} = require("../controllers/driverController");

router.post(
  "/create",
  protect,
  roleGuard(["DRIVER"]),
  createDriverProfile
);

router.get(
  "/profile-info",
  protect,
  roleGuard(["DRIVER"]),
  getDriverProfile
);

router.put(
  "/profile",
  protect,
  roleGuard(["DRIVER"]),
  updateDriverProfile
);

router.post(
  "/upload-docs",
  protect,
  roleGuard(["DRIVER"]),
  uploadDocuments
);

router.put(
  "/vehicle",
  protect,
  roleGuard(["DRIVER"]),
  updateVehicleInfo
);


router.put(
  "/location",
  protect,
  roleGuard(["DRIVER"]),
  requireApprovedDriver,
  updateLocation
);

router.put(
  "/status",
  protect,
  roleGuard(["DRIVER"]),
   requireApprovedDriver,
  updateDriverStatus
);

router.get(
  "/nearby",
  protect,
  roleGuard(["CUSTOMER"]),
  getNearbyDrivers,   
 
);
router.get(
  "/:id",
  protect,
  roleGuard(["CUSTOMER"]),
  getDriverById,   
 
);
router.get("/online", protect, roleGuard(["CUSTOMER"]), getOnlineDrivers);

module.exports = router;
