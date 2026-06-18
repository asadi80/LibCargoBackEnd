const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleMiddleware");
const driverReady = require("../middleware/driverReady");
const {
  createShipment,
  getMyShipments,
  getAllShipments,
  expressInterest,
  getShipmentInterests,
  selectDriver,
  updateShipmentStatus,
  getShipmentById,
  uploadProof,
  getNearbyShipments,
  getShipmentsByPickupRadius,
  deleteShipmentById
} = require("../controllers/shipmentController");

// ─── Static routes first ─────────────────────────────────────────────────────

// Customer: create a shipment
router.post("/", protect, roleGuard(["CUSTOMER"]), createShipment);

// Customer: list own shipments
router.get("/my", protect, roleGuard(["CUSTOMER"]), getMyShipments);

// Driver: list available (PENDING, unassigned) shipments
router.get("/", protect, roleGuard(["DRIVER"]), driverReady, getAllShipments);

// ─── Param routes after ───────────────────────────────────────────────────────

// Customer: see which drivers expressed interest
router.get(
  "/:shipmentId/interests",
  protect,
  roleGuard(["DRIVER"]),
  getShipmentInterests,
);
router.get("/:shipmentId", protect, roleGuard(["CUSTOMER"]), getShipmentById);

// Customer: assign a driver
router.put(
  "/:shipmentId/select-driver",
  protect,
  roleGuard(["CUSTOMER"]),
  selectDriver,
);

// Driver: express interest in a shipment
router.post(
  "/:shipmentId/interest",
  protect,
  roleGuard(["DRIVER"]),
  driverReady,
  expressInterest,
);

router.post("/api/shipments/:id/proof", uploadProof);

// Get nearby shipments (GET with query params)
router.post("/nearby", protect, roleGuard(["DRIVER"]), getNearbyShipments);

// Get shipments by pickup radius (POST with body)
router.get(
  "/nearby-by-radius",
  protect,
  roleGuard(["DRIVER"]),
  getShipmentsByPickupRadius,
);

// Driver: update shipment status (ASSIGNED → PICKED_UP → DELIVERED etc.)
router.put(
  "/:shipmentId/status",
  protect,
  roleGuard(["DRIVER"]),
  driverReady,
  updateShipmentStatus,
);

// Routes
router.delete('/deleteShimment/:shipmentId', 
  protect,
  roleGuard(["CUSTOMER"]),deleteShipmentById
);

module.exports = router;
