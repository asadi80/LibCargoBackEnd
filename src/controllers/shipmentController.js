const prisma = require("../lib/prisma");
const { getIO } = require("../socket");
const { canTransition } = require("../utils/shipmentFlow");
const {
  createNotification,
  sendPushNotificationToUser,
} = require("../services/notificationService");

// Haversine formula to calculate distance between two coordinates (in km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const createShipment = async (req, res) => {
  try {
    const {
      pickupAddr,
      deliveryAddr,
      price,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      description,
      specialInstructions,
      requiredVehicle,
      requestedPickupTime,
      requestedDropoffTime,
    } = req.body;

    if (!pickupAddr || !deliveryAddr || !price) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Price must be a positive number" });
    }

    if (pickupLat && (pickupLat < -90 || pickupLat > 90)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid pickup latitude" });
    }

    const shipment = await prisma.shipment.create({
      data: {
        customerId: req.user.id,
        pickupAddr,
        deliveryAddr,
        pickupLat: pickupLat ?? null,
        pickupLng: pickupLng ?? null,
        dropoffLat: dropoffLat ?? null,
        dropoffLng: dropoffLng ?? null,
        price: parsedPrice,
        status: "AVAILABLE",
        description: description ?? null,
        specialInstructions: specialInstructions ?? null,
        requiredVehicle: requiredVehicle ?? null,
        requestedPickupTime: requestedPickupTime ?? null,
        requestedDropoffTime: requestedDropoffTime ?? null,
      },
    });

    res.status(201).json({ success: true, shipment });
  } catch (error) {
    console.error("Create shipment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMyShipments = async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: { customerId: req.user.id },
      include: { driver: true },
    });
    res.json({ success: true, shipments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllShipments = async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: { status: "PENDING", driverId: null },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    res.json({ success: true, shipments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const expressInterest = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver)
      return res
        .status(404)
        .json({ success: false, message: "Driver profile not found" });

    const existing = await prisma.shipmentInterest.findFirst({
      where: { shipmentId, driverId: driver.id },
    });
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "Already interested" });

    const interest = await prisma.shipmentInterest.create({
      data: { shipmentId, driverId: driver.id },
    });

    res.json({ success: true, interest });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateShipmentStatus = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { status } = req.body;

    if (!status)
      return res
        .status(400)
        .json({ success: false, message: "Shipment status is required" });

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { driver: true },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    if (!canTransition(shipment.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid transition: ${shipment.status} -> ${status}`,
      });
    }

    if (shipment.driver && shipment.driver.userId !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Not your shipment" });
    }

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: { status },
    });

    const io = getIO();
    io.to(shipment.customerId).emit("shipment-status-update", {
      shipmentId,
      status,
      updatedAt: new Date(),
    });

    if (shipment.driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: shipment.driverId },
        select: { userId: true },
      });
      if (driver) {
        io.to(driver.userId).emit("shipment-status-update", {
          shipmentId,
          status,
          updatedAt: new Date(),
        });
      }
    }

    res.json({ success: true, shipment: updated });
  } catch (error) {
    console.error("Error updating shipment status:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getShipmentById = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        driver: {
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
      },
    });

    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    if (shipment.customerId !== req.user.id)
      return res.status(403).json({ success: false, message: "Access denied" });

    res.json({ success: true, shipment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const uploadProof = async (req, res) => {
  try {
    const { id } = req.params;
    const { photoUrl, signatureUrl, lat, lng } = req.body;

    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        proofPhotoUrl: photoUrl,
        proofSignatureUrl: signatureUrl,
        deliveredLat: lat,
        deliveredLng: lng,
        deliveredAt: new Date(),
        status: "DELIVERED",
      },
    });

    req.io.emit("shipment-delivered", shipment);
    res.json(shipment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getShipmentInterests = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    const interests = await prisma.shipmentInterest.findMany({
      where: { shipmentId },
      include: {
        driver: {
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
      },
    });

    const users = interests.map((i) => i.driver.user);
    return res.json({ success: true, shipment, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const selectDriver = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { driverId } = req.body;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    if (shipment.customerId !== req.user.id)
      return res
        .status(403)
        .json({ success: false, message: "Not your shipment" });

    const interest = await prisma.shipmentInterest.findFirst({
      where: { shipmentId, driverId },
    });
    if (!interest)
      return res.status(400).json({
        success: false,
        message: "Driver has not expressed interest in this shipment",
      });

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: { driverId, status: "ASSIGNED" },
    });

    const io = getIO();
    io.to(driverId).emit("shipment-assigned", {
      shipmentId,
      message: "You got a new shipment!",
    });

    res.json({ success: true, shipment: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getNearbyShipments = async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.body;

    if (!lat || !lng)
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });

    const driverLat = parseFloat(lat);
    const driverLng = parseFloat(lng);
    const searchRadius = parseFloat(radius);

    const shipments = await prisma.shipment.findMany({
      where: { status: "AVAILABLE", driverId: null },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const nearbyShipments = shipments
      .filter((shipment) => {
        if (!shipment.pickupLat || !shipment.pickupLng) return false;
        const distance = calculateDistance(
          driverLat,
          driverLng,
          shipment.pickupLat,
          shipment.pickupLng,
        );
        shipment.distanceToPickup = distance;
        return distance <= searchRadius;
      })
      .sort((a, b) => a.distanceToPickup - b.distanceToPickup);

    res.json({
      success: true,
      count: nearbyShipments.length,
      shipments: nearbyShipments,
      driverLocation: { lat: driverLat, lng: driverLng },
      searchRadius,
    });
  } catch (error) {
    console.error("Error finding nearby shipments:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getShipmentsByPickupRadius = async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.body;
    if (!lat || !lng)
      return res
        .status(400)
        .json({ success: false, message: "Driver location required" });

    const shipments = await prisma.shipment.findMany({
      where: {
        status: "PENDING",
        driverId: null,
        pickupLat: { not: null },
        pickupLng: { not: null },
      },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });

    const nearbyShipments = shipments
      .map((s) => ({
        ...s,
        distanceToPickup: calculateDistance(
          parseFloat(lat),
          parseFloat(lng),
          s.pickupLat,
          s.pickupLng,
        ),
      }))
      .filter((s) => s.distanceToPickup <= parseFloat(radius))
      .sort((a, b) => a.distanceToPickup - b.distanceToPickup);

    res.json({
      success: true,
      count: nearbyShipments.length,
      shipments: nearbyShipments,
      driverLocation: { lat, lng },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteShipmentById = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { driver: true, customer: true },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    const isOwner = shipment.customerId === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this shipment",
      });
    }

    const cannotDeleteStatuses = [
      "ASSIGNED",
      "PICKED_UP",
      "IN_TRANSIT",
      "DELIVERED",
    ];
    if (cannotDeleteStatuses.includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete shipment with status: ${shipment.status}`,
      });
    }

    await prisma.shipmentInterest.deleteMany({ where: { shipmentId } });
    await prisma.shipment.delete({ where: { id: shipmentId } });

    const io = getIO();
    if (shipment.customerId !== req.user.id) {
      io.to(shipment.customerId).emit("shipment-deleted", {
        shipmentId,
        message: "Your shipment has been deleted",
      });
    }
    if (shipment.driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: shipment.driverId },
        select: { userId: true },
      });
      if (driver)
        io.to(driver.userId).emit("shipment-deleted", {
          shipmentId,
          message: "A shipment assigned to you has been deleted",
        });
    }

    res.json({
      success: true,
      message: "Shipment deleted successfully",
      shipmentId,
    });
  } catch (error) {
    console.error("Error deleting shipment:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── acceptShipment ───────────────────────────────────────────────────────────
const acceptShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver)
      return res.status(403).json({
        success: false,
        message: "Only drivers can accept shipments.",
      });

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        customer: { select: { id: true, name: true, expoPushToken: true } },
      },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found." });
    if (shipment.driverId)
      return res.status(400).json({
        success: false,
        message: "This shipment already has a driver.",
      });
    if (!["AVAILABLE", "PENDING"].includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot accept a shipment with status ${shipment.status}.`,
      });
    }

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        driverId: driver.id,
        status: "ASSIGNED",
        acceptedAt: new Date(),
        driverAcceptedAt: new Date(),
      },
    });

    // ── Socket ──
    const io = getIO();
    io.to(shipment.customerId).emit("shipment-accepted", {
      id: Date.now().toString(),
      type: "SHIPMENT_ASSIGNED",
      title: "Driver Assigned 🚚",
      message: `A driver has accepted your shipment from ${shipment.pickupAddr} to ${shipment.deliveryAddr}.`,
      shipmentId,
      createdAt: new Date().toISOString(),
      isRead: false,
      driverId: driver.id,
    });

    // ── DB notification → customer ──
    await createNotification({
      userId: shipment.customerId,
      shipmentId,
      type: "SHIPMENT_ASSIGNED",
      title: "Driver Assigned 🚚",
      message: `A driver has accepted your shipment from ${shipment.pickupAddr} to ${shipment.deliveryAddr}.`,
      data: { shipmentId, driverName: req.user.name, driverId: driver.id },
    });

    // ── Push notification → customer ──
    await sendPushNotificationToUser(
      shipment.customerId,
      "Driver Assigned 🚚",
      `A driver has accepted your shipment from ${shipment.pickupAddr} to ${shipment.deliveryAddr}.`,
      { shipmentId, type: "SHIPMENT_ASSIGNED", driverName: req.user.name },
    );

    res.json({ success: true, shipment: updated });
  } catch (error) {
    console.error("Error accepting shipment:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── pickupShipment ───────────────────────────────────────────────────────────
const pickupShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver)
      return res.status(403).json({
        success: false,
        message: "Only drivers can update pickup status.",
      });

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        customer: { select: { id: true, name: true, expoPushToken: true } },
      },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found." });
    if (shipment.driverId !== driver.id)
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this shipment.",
      });
    if (shipment.status !== "ASSIGNED")
      return res.status(400).json({
        success: false,
        message: `Cannot mark as picked up from status ${shipment.status}.`,
      });

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: "PICKED_UP",
        pickedUpAt: new Date(),
        driverPickedUpAt: new Date(),
      },
    });

    // ── Socket ──
    const io = getIO();
    io.to(shipment.customerId).emit("shipment-picked-up", {
      id: Date.now().toString(),
      type: "SHIPMENT_PICKED_UP",
      title: "Shipment Picked Up 📦",
      message: `Your shipment from ${shipment.pickupAddr} has been picked up and is on its way.`,
      shipmentId,
      createdAt: new Date().toISOString(),
      isRead: false,
    });

    // ── DB notification → customer ──
    await createNotification({
      userId: shipment.customerId,
      shipmentId,
      type: "SHIPMENT_PICKED_UP",
      title: "Shipment Picked Up 📦",
      message: `Your shipment from ${shipment.pickupAddr} has been picked up and is on its way.`,
      data: { shipmentId, driverName: req.user.name },
    });

    // ── Push notification → customer ──
    await sendPushNotificationToUser(
      shipment.customerId,
      "Shipment Picked Up 📦",
      `Your shipment from ${shipment.pickupAddr} has been picked up and is on its way.`,
      { shipmentId, type: "SHIPMENT_PICKED_UP", driverName: req.user.name },
    );

    res.json({ success: true, shipment: updated });
  } catch (error) {
    console.error("Error marking pickup:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── deliverShipment ──────────────────────────────────────────────────────────
const deliverShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver)
      return res.status(403).json({
        success: false,
        message: "Only drivers can update delivery status.",
      });

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        customer: { select: { id: true, name: true, expoPushToken: true } },
      },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found." });
    if (shipment.driverId !== driver.id)
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this shipment.",
      });
    if (!["PICKED_UP", "IN_TRANSIT"].includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot mark as delivered from status ${shipment.status}.`,
      });
    }

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        driverDeliveredAt: new Date(),
      },
    });

    // ── Socket ──
    const io = getIO();
    io.to(shipment.customerId).emit("shipment-delivered", {
      id: Date.now().toString(),
      type: "SHIPMENT_DELIVERED",
      title: "Shipment Delivered ✅",
      message: `Your shipment has been delivered to ${shipment.deliveryAddr}.`,
      shipmentId,
      createdAt: new Date().toISOString(),
      isRead: false,
    });

    // ── DB notification → customer ──
    await createNotification({
      userId: shipment.customerId,
      shipmentId,
      type: "SHIPMENT_DELIVERED",
      title: "Shipment Delivered ✅",
      message: `Your shipment has been delivered to ${shipment.deliveryAddr}. Thank you for using LibCargo!`,
      data: {
        shipmentId,
        driverName: req.user.name,
        deliveryAddr: shipment.deliveryAddr,
      },
    });

    // ── Push notification → customer ──
    await sendPushNotificationToUser(
      shipment.customerId,
      "Shipment Delivered ✅",
      `Your shipment has been delivered to ${shipment.deliveryAddr}. Thank you for using LibCargo!`,
      {
        shipmentId,
        type: "SHIPMENT_DELIVERED",
        deliveryAddr: shipment.deliveryAddr,
      },
    );

    // ── DB notification → driver (delivery confirmation) ──
    await createNotification({
      userId: req.user.id,
      shipmentId,
      type: "SHIPMENT_DELIVERED",
      title: "Delivery Confirmed ✅",
      message: `You have successfully delivered the shipment to ${shipment.deliveryAddr}.`,
      data: { shipmentId, deliveryAddr: shipment.deliveryAddr },
    });

    res.json({ success: true, shipment: updated });
  } catch (error) {
    console.error("Error marking delivered:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAssignedShipments = async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver)
      return res.status(403).json({
        success: false,
        message: "Only drivers can view assigned shipments.",
      });

    const shipments = await prisma.shipment.findMany({
      where: {
        driverId: driver.id,
        status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] },
      },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        driver: {
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });

    let shipmentsWithDistance = shipments;
    if (driver.latitude && driver.longitude) {
      shipmentsWithDistance = shipments
        .map((s) => ({
          ...s,
          distanceToPickup:
            s.pickupLat && s.pickupLng
              ? calculateDistance(
                  driver.latitude,
                  driver.longitude,
                  s.pickupLat,
                  s.pickupLng,
                )
              : undefined,
        }))
        .sort((a, b) =>
          a.distanceToPickup && b.distanceToPickup
            ? a.distanceToPickup - b.distanceToPickup
            : 0,
        );
    }

    res.json({
      success: true,
      count: shipmentsWithDistance.length,
      shipments: shipmentsWithDistance,
    });
  } catch (error) {
    console.error("Error fetching assigned shipments:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDeliveredShipments = async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver)
      return res.status(403).json({
        success: false,
        message: "Only drivers can view delivery history.",
      });

    const shipments = await prisma.shipment.findMany({
      where: { driverId: driver.id, status: "DELIVERED" },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { deliveredAt: "desc" },
    });

    res.json({ success: true, shipments });
  } catch (error) {
    console.error("Error fetching delivered shipments:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const cancelShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { cancellationReason } = req.body;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        driver: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                expoPushToken: true,
              },
            },
          },
        },
        customer: {
          select: { id: true, name: true, phone: true, expoPushToken: true },
        },
      },
    });
    if (!shipment)
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });

    const isCustomer = shipment.customerId === req.user.id;
    const isAdmin = req.user.role === "admin";
    const isDriver =
      shipment.driverId && shipment.driver?.userId === req.user.id;

    if (!isCustomer && !isAdmin && !isDriver) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to cancel this shipment",
      });
    }

    const cancellableStatuses = ["AVAILABLE", "PENDING", "ASSIGNED"];
    if (!cancellableStatuses.includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel shipment with status: ${shipment.status}`,
      });
    }

    if (isDriver && shipment.driverId) {
      const driver = await prisma.driver.findUnique({
        where: { userId: req.user.id },
      });
      if (!driver || shipment.driverId !== driver.id) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to this shipment",
        });
      }
    }

    let newStatus, actionType, notifyMessage;
    if (isDriver && shipment.status === "ASSIGNED") {
      newStatus = "AVAILABLE";
      actionType = "released";
      notifyMessage =
        "The driver has released your shipment. It's now available for other drivers.";
    } else {
      newStatus = "CANCELLED";
      actionType = "cancelled";
      notifyMessage = isAdmin
        ? "Your shipment has been cancelled by an administrator."
        : "You have cancelled your shipment.";
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: newStatus,
        cancelledAt: new Date(),
        cancelledBy: req.user.id,
        cancellationReason: cancellationReason || "No reason provided",
        driverId: null,
        ...(newStatus === "AVAILABLE" && {
          acceptedAt: null,
          driverAcceptedAt: null,
        }),
      },
    });

    // Notify driver
    if (shipment.driverId && !isDriver) {
      await createNotification({
        userId: shipment.driver.userId,
        shipmentId,
        type: "SHIPMENT_CANCELLED",
        title: `Shipment ${actionType}`,
        message: `Shipment #${shipmentId.slice(0, 8)} has been ${actionType}`,
        data: {
          shipmentId,
          action: actionType,
          reason: cancellationReason || "No reason provided",
        },
      });
      await sendPushNotificationToUser(
        shipment.driver.userId,
        `Shipment ${actionType}`,
        `Shipment #${shipmentId.slice(0, 8)} has been ${actionType} by ${isAdmin ? "Admin" : "Customer"}`,
        { shipmentId, type: "SHIPMENT_CANCELLED", action: actionType },
      );
    }

    // Notify customer
    if (!isCustomer) {
      await createNotification({
        userId: shipment.customerId,
        shipmentId,
        type: "SHIPMENT_CANCELLED",
        title: `Shipment ${actionType}`,
        message: notifyMessage,
        data: {
          shipmentId,
          action: actionType,
          reason: cancellationReason || "No reason provided",
        },
      });
      await sendPushNotificationToUser(
        shipment.customerId,
        `Shipment ${actionType}`,
        notifyMessage,
        { shipmentId, type: "SHIPMENT_CANCELLED", action: actionType },
      );
    }

    // If released → notify nearby drivers
    if (newStatus === "AVAILABLE") {
      const nearbyDrivers = await prisma.driver.findMany({
        where: {
          status: "AVAILABLE",
          isOnline: true,
          latitude: { not: null },
          longitude: { not: null },
        },
        include: {
          user: { select: { id: true, name: true, expoPushToken: true } },
        },
      });

      if (nearbyDrivers.length > 0) {
        await Promise.all(
          nearbyDrivers.map(async (driver) => {
            await createNotification({
              userId: driver.userId,
              shipmentId,
              type: "SHIPMENT_AVAILABLE",
              title: "New Shipment Available! 🚚",
              message: `A shipment from ${shipment.pickupAddr} to ${shipment.deliveryAddr} is now available for $${shipment.price}`,
              data: {
                shipmentId,
                pickupAddr: shipment.pickupAddr,
                deliveryAddr: shipment.deliveryAddr,
                price: shipment.price,
              },
            });
            await sendPushNotificationToUser(
              driver.userId,
              "New Shipment Available! 🚚",
              `Shipment from ${shipment.pickupAddr} to ${shipment.deliveryAddr} - $${shipment.price}`,
              { shipmentId, type: "SHIPMENT_AVAILABLE" },
            );
          }),
        );
      }
    }

    const io = getIO();
    const notificationData = {
      shipmentId,
      status: newStatus,
      action: actionType,
      reason: cancellationReason || "No reason provided",
      cancelledBy: req.user.id,
      timestamp: new Date(),
    };

    if (shipment.driverId && !isDriver)
      io.to(shipment.driver.userId).emit("shipment-cancelled", {
        ...notificationData,
        message: `Shipment #${shipmentId.slice(0, 8)} has been ${actionType}`,
      });
    if (!isCustomer)
      io.to(shipment.customerId).emit("shipment-cancelled", {
        ...notificationData,
        message: notifyMessage,
      });
    if (newStatus === "AVAILABLE")
      io.emit("shipment-available", {
        shipmentId,
        shipment: {
          pickupAddr: shipment.pickupAddr,
          deliveryAddr: shipment.deliveryAddr,
          price: shipment.price,
        },
      });

    res.json({
      success: true,
      message: `Shipment ${actionType} successfully`,
      action: actionType,
      shipment: {
        id: updatedShipment.id,
        status: updatedShipment.status,
        cancelledAt: updatedShipment.cancelledAt,
      },
    });
  } catch (error) {
    console.error("Error cancelling shipment:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createShipment,
  getMyShipments,
  getAllShipments,
  expressInterest,
  getShipmentInterests,
  selectDriver,
  updateShipmentStatus,
  getShipmentById,
  uploadProof,
  getShipmentsByPickupRadius,
  getNearbyShipments,
  deleteShipmentById,
  acceptShipment,
  pickupShipment,
  deliverShipment,
  getAssignedShipments,
  getDeliveredShipments,
  cancelShipment,
};
