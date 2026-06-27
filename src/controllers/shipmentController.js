const prisma = require("../lib/prisma");
const { getIO } = require("../socket");
const { canTransition } = require("../utils/shipmentFlow");
const {
  createNotification,  sendPushNotificationToUser
} = require("../services/notificationService");
// Haversine formula to calculate distance between two coordinates (in km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
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

    // Validate required fields
    if (!pickupAddr || !deliveryAddr || !price) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Validate price is a number
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a positive number",
      });
    }

    // Optional: Validate coordinates if provided
    if (pickupLat && (pickupLat < -90 || pickupLat > 90)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pickup latitude",
      });
    }

    const shipment = await prisma.shipment.create({
      data: {
        customerId: req.user.id,
        pickupAddr,
        deliveryAddr,
        pickupLat: pickupLat ?? null, // Use nullish coalescing
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

    res.status(201).json({
      success: true,
      shipment,
    });
  } catch (error) {
    console.error("Create shipment error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getMyShipments = async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: {
        customerId: req.user.id,
      },
      include: {
        driver: true,
      },
    });
    console.log(shipments);

    res.json({
      success: true,
      shipments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAllShipments = async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      where: {
        status: "PENDING",
        driverId: null,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    res.json({
      success: true,
      shipments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const expressInterest = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    const driver = await prisma.driver.findUnique({
      where: {
        userId: req.user.id,
      },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    const existing = await prisma.shipmentInterest.findFirst({
      where: {
        shipmentId,
        driverId: driver.id,
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Already interested",
      });
    }

    const interest = await prisma.shipmentInterest.create({
      data: {
        shipmentId,
        driverId: driver.id,
      },
    });

    res.json({
      success: true,
      interest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateShipmentStatus = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Shipment status is required",
      });
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { driver: true },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    if (!canTransition(shipment.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid transition: ${shipment.status} -> ${status}`,
      });
    }

    if (shipment.driver && shipment.driver.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not your shipment",
      });
    }

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: { status },
    });

    const io = getIO();
    
    // FIXED: Use proper variable names
    io.to(shipment.customerId).emit("shipment-status-update", {
      shipmentId,
      status,
      updatedAt: new Date(),
    });

    // If driver is assigned, notify them too
    if (shipment.driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: shipment.driverId },
        select: { userId: true }
      });
      if (driver) {
        io.to(driver.userId).emit("shipment-status-update", {
          shipmentId,
          status,
          updatedAt: new Date(),
        });
      }
    }

    res.json({
      success: true,
      shipment: updated,
    });
  } catch (error) {
    console.error("Error updating shipment status:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


const getShipmentById = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        driver: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });

    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found" });
    }

    if (shipment.customerId !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

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

    // notify customer in real-time
    req.io.emit("shipment-delivered", shipment);

    res.json(shipment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getShipmentInterests = async (req, res) => {
  console.log("route was called");

  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: {
        id: shipmentId,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    const interests = await prisma.shipmentInterest.findMany({
      where: {
        shipmentId,
      },
      include: {
        driver: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    // extract ONLY users
    const users = interests.map((i) => i.driver.user);

    return res.json({
      success: true,
      shipment, // includes customer inside
      users, // interested drivers as users only
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const selectDriver = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { driverId } = req.body;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    if (shipment.customerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not your shipment",
      });
    }
    const interest = await prisma.shipmentInterest.findFirst({
      where: { shipmentId, driverId },
    });

    if (!interest) {
      return res.status(400).json({
        success: false,
        message: "Driver has not expressed interest in this shipment",
      });
    }

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        driverId,
        status: "ASSIGNED",
      },
    });
    const io = getIO();

    io.to(driverId).emit("shipment-assigned", {
      shipmentId,
      message: "You got a new shipment!",
    });

    res.json({
      success: true,
      shipment: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get nearby shipments based on driver's location
const getNearbyShipments = async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.body; // radius in km, default 10km
    const driverId = req.user.id; // Assuming driver is linked to user

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const driverLat = parseFloat(lat);
    const driverLng = parseFloat(lng);
    const searchRadius = parseFloat(radius);

    // Fetch all available shipments (PENDING status and no driver assigned)
    const shipments = await prisma.shipment.findMany({
      where: {
        status: "AVAILABLE",
        driverId: null,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate distance and filter by radius
    const nearbyShipments = shipments
      .filter((shipment) => {
        // Skip if no pickup coordinates
        if (!shipment.pickupLat || !shipment.pickupLng) return false;

        const distance = calculateDistance(
          driverLat,
          driverLng,
          shipment.pickupLat,
          shipment.pickupLng,
        );

        // Add distance to shipment object for sorting
        shipment.distanceToPickup = distance;

        return distance <= searchRadius;
      })
      .sort((a, b) => a.distanceToPickup - b.distanceToPickup); // Sort by nearest first

    res.json({
      success: true,
      count: nearbyShipments.length,
      shipments: nearbyShipments,
      driverLocation: { lat: driverLat, lng: driverLng },
      searchRadius,
    });
  } catch (error) {
    console.error("Error finding nearby shipments:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get shipments by radius with pickup location focus
const getShipmentsByPickupRadius = async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Driver location required",
      });
    }

    const shipments = await prisma.shipment.findMany({
      where: {
        status: "PENDING",
        driverId: null,
        pickupLat: { not: null },
        pickupLng: { not: null },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    // Calculate distances and filter
    const shipmentsWithDistance = shipments.map((shipment) => ({
      ...shipment,
      distanceToPickup: calculateDistance(
        parseFloat(lat),
        parseFloat(lng),
        shipment.pickupLat,
        shipment.pickupLng,
      ),
    }));

    const nearbyShipments = shipmentsWithDistance
      .filter((s) => s.distanceToPickup <= parseFloat(radius))
      .sort((a, b) => a.distanceToPickup - b.distanceToPickup);

    res.json({
      success: true,
      count: nearbyShipments.length,
      shipments: nearbyShipments,
      driverLocation: { lat, lng },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteShipmentById = async (req, res) => {
  console.log("delete route was called");

  try {
    const { shipmentId } = req.params;

    // Check if shipment exists
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        driver: true,
        customer: true,
      },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // === ENHANCED OWNERSHIP CHECK ===
    // Check if the shipment belongs to the user
    const isOwner = shipment.customerId === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this shipment",
        // Optional: Provide more details for debugging
        details: {
          shipmentOwnerId: shipment.customerId,
          currentUserId: req.user.id,
          userRole: req.user.role,
        },
      });
    }

    // Optional: Additional check - if user is not admin, verify they are the owner
    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Only the shipment owner or admin can delete this shipment",
      });
    }

    // Check if shipment can be deleted (status validation)
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
        // Suggest what to do instead
        suggestion:
          shipment.status === "ASSIGNED"
            ? "Please cancel the shipment first"
            : "Shipment is already in progress or completed",
      });
    }

    // Log who is deleting (for audit purposes)
    console.log(
      `User ${req.user.id} (${req.user.role}) deleting shipment ${shipmentId}`,
    );

    // Delete related records first
    await prisma.shipmentInterest.deleteMany({
      where: { shipmentId },
    });

    // Delete the shipment
    await prisma.shipment.delete({
      where: { id: shipmentId },
    });

    // Get socket.io instance
    const io = getIO();

    // Notify the customer (if they're not the one who deleted it)
    if (shipment.customerId !== req.user.id) {
      io.to(shipment.customerId).emit("shipment-deleted", {
        shipmentId,
        message: "Your shipment has been deleted",
        deletedBy: req.user.id,
        deletedAt: new Date(),
      });
    }

    // If driver was assigned, notify them
    if (shipment.driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: shipment.driverId },
        select: { userId: true },
      });

      if (driver) {
        io.to(driver.userId).emit("shipment-deleted", {
          shipmentId,
          message: "A shipment assigned to you has been deleted",
          deletedBy: req.user.id,
          deletedAt: new Date(),
        });
      }
    }

    // Broadcast to admins
    io.emit("shipment-deleted", {
      shipmentId,
      deletedBy: req.user.id,
      deletedByRole: req.user.role,
      timestamp: new Date(),
      shipmentDetails: {
        customerId: shipment.customerId,
        driverId: shipment.driverId,
        status: shipment.status,
        price: shipment.price,
      },
    });

    res.json({
      success: true,
      message: "Shipment deleted successfully",
      shipmentId: shipmentId,
      deletedBy: {
        userId: req.user.id,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("Error deleting shipment:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const acceptShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Only drivers can accept shipments.",
        });
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            expoPushToken: true,
          }
        }
      }
    });
    
    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found." });
    }
    if (shipment.driverId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "This shipment already has a driver.",
        });
    }
    if (!["AVAILABLE", "PENDING"].includes(shipment.status)) {
      return res
        .status(400)
        .json({
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

    // Notify customer via socket
    const io = getIO();
    io.to(shipment.customerId).emit("shipment-accepted", {
      shipmentId,
      driverId: driver.id,
    });

    // FIXED: Send push notification using the helper function
    if (shipment.customer?.expoPushToken) {
      await sendPushNotification(
        shipment.customer.expoPushToken,
        "Driver Assigned",
        `${req.user.name} accepted your shipment`,
        {
          shipmentId,
          type: "SHIPMENT_ACCEPTED",
          driverName: req.user.name,
        }
      );
    }

    res.json({ success: true, shipment: updated });
  } catch (error) {
    console.error("Error accepting shipment:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


const pickupShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Only drivers can update pickup status.",
        });
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found." });
    }
    if (shipment.driverId !== driver.id) {
      return res
        .status(403)
        .json({
          success: false,
          message: "You are not assigned to this shipment.",
        });
    }
    if (shipment.status !== "ASSIGNED") {
      return res
        .status(400)
        .json({
          success: false,
          message: `Cannot mark as picked up from status ${shipment.status}.`,
        });
    }

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: "PICKED_UP",
        pickedUpAt: new Date(),
        driverPickedUpAt: new Date(),
      },
    });

    const io = getIO();
    io.to(shipment.customerId).emit("shipment-picked-up", { shipmentId });

    res.json({ success: true, shipment: updated });
  } catch (error) {
    console.error("Error marking pickup:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const deliverShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Only drivers can update delivery status.",
        });
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: "Shipment not found." });
    }
    if (shipment.driverId !== driver.id) {
      return res
        .status(403)
        .json({
          success: false,
          message: "You are not assigned to this shipment.",
        });
    }
    if (!["PICKED_UP", "IN_TRANSIT"].includes(shipment.status)) {
      return res
        .status(400)
        .json({
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

    const io = getIO();
    io.to(shipment.customerId).emit("shipment-delivered", { shipmentId });

    res.json({ success: true, shipment: updated });
  } catch (error) {
    console.error("Error marking delivered:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAssignedShipments = async (req, res) => {
  console.log("route called");

  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });

    if (!driver) {
      return res.status(403).json({
        success: false,
        message: "Only drivers can view assigned shipments.",
      });
    }

    const shipments = await prisma.shipment.findMany({
      where: {
        driverId: driver.id,
        status: {
          in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"],
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        driver: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          status: "asc", // PICKED_UP/IN_TRANSIT first, then ASSIGNED
        },
        {
          createdAt: "asc",
        },
      ],
    });

    // Use driver's current location from the driver model
    let shipmentsWithDistance = shipments;
    if (driver.latitude && driver.longitude) {
      shipmentsWithDistance = shipments.map((shipment) => {
        if (shipment.pickupLat && shipment.pickupLng) {
          const distance = calculateDistance(
            driver.latitude,
            driver.longitude,
            shipment.pickupLat,
            shipment.pickupLng,
          );
          return {
            ...shipment,
            distanceToPickup: distance,
          };
        }
        return shipment;
      });

      // Sort by distance if locations are available
      shipmentsWithDistance.sort((a, b) => {
        if (a.distanceToPickup && b.distanceToPickup) {
          return a.distanceToPickup - b.distanceToPickup;
        }
        return 0;
      });
    }

    res.json({
      success: true,
      count: shipmentsWithDistance.length,
      shipments: shipmentsWithDistance,
      driverLocation:
        driver.latitude && driver.longitude
          ? { lat: driver.latitude, lng: driver.longitude }
          : null,
    });
  } catch (error) {
    console.error("Error fetching assigned shipments:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// shipmentController.js
const getDeliveredShipments = async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });
    if (!driver) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Only drivers can view delivery history.",
        });
    }

    const shipments = await prisma.shipment.findMany({
      where: { driverId: driver.id, status: "DELIVERED" },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
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

    // Find the shipment with related data
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
          select: {
            id: true,
            name: true,
            phone: true,
            expoPushToken: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // Check if user is authorized to cancel
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

    // Check if shipment can be cancelled
    const cancellableStatuses = ["AVAILABLE", "PENDING", "ASSIGNED"];
    if (!cancellableStatuses.includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel shipment with status: ${shipment.status}`,
        suggestion:
          shipment.status === "PICKED_UP"
            ? "Shipment has already been picked up. Please contact support."
            : shipment.status === "IN_TRANSIT"
              ? "Shipment is in transit. Please contact support."
              : shipment.status === "DELIVERED"
                ? "Shipment is already delivered. Cannot cancel."
                : "Shipment is in progress. Contact support.",
      });
    }

    // If driver is cancelling, they must be assigned to this shipment
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

    // Determine the appropriate status
    let newStatus;
    let actionType;
    let notifyMessage;

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

    // Update shipment status
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

    // ============================================================
    // 📱 CREATE NOTIFICATIONS & SEND PUSH NOTIFICATIONS
    // ============================================================

    // 1. NOTIFY DRIVER (if assigned and not the one cancelling)
    if (shipment.driverId && !isDriver) {
      const driverNotification = await createNotification({
        userId: shipment.driver.userId,
        shipmentId: shipmentId,
        type: "SHIPMENT_CANCELLED",
        title: `Shipment ${actionType}`,
        message: `Shipment #${shipmentId.slice(0, 8)} has been ${actionType}`,
        data: {
          shipmentId,
          action: actionType,
          reason: cancellationReason || "No reason provided",
          customerName: shipment.customer?.name || "Customer",
        },
      });

      // Send push notification to driver
      await sendPushNotificationToUser(
        shipment.driver.userId,
        `Shipment ${actionType}`,
        `Shipment #${shipmentId.slice(0, 8)} has been ${actionType} by ${isAdmin ? 'Admin' : 'Customer'}`,
        {
          shipmentId,
          type: "SHIPMENT_CANCELLED",
          action: actionType,
        }
      );
    }

    // 2. NOTIFY CUSTOMER (if not the one cancelling)
    if (!isCustomer) {
      const customerNotification = await createNotification({
        userId: shipment.customerId,
        shipmentId: shipmentId,
        type: "SHIPMENT_CANCELLED",
        title: `Shipment ${actionType}`,
        message: notifyMessage,
        data: {
          shipmentId,
          action: actionType,
          reason: cancellationReason || "No reason provided",
          cancelledBy: isAdmin ? "Admin" : isDriver ? "Driver" : "Unknown",
        },
      });

      // Send push notification to customer
      await sendPushNotificationToUser(
        shipment.customerId,
        `Shipment ${actionType}`,
        notifyMessage,
        {
          shipmentId,
          type: "SHIPMENT_CANCELLED",
          action: actionType,
        }
      );
    }

    // 3. 🎯 IF RELEASED TO AVAILABLE - Notify nearby drivers
    if (newStatus === "AVAILABLE") {
      // Find available online drivers nearby
      const nearbyDrivers = await prisma.driver.findMany({
        where: {
          status: "AVAILABLE",
          isOnline: true,
          latitude: { not: null },
          longitude: { not: null },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              expoPushToken: true,
            },
          },
        },
      });

      // Create notifications and send push notifications for nearby drivers
      if (nearbyDrivers.length > 0) {
        const notificationPromises = nearbyDrivers.map(async (driver) => {
          // Create database notification
          await createNotification({
            userId: driver.userId,
            shipmentId: shipmentId,
            type: "SHIPMENT_AVAILABLE",
            title: "New Shipment Available! 🚚",
            message: `A shipment from ${shipment.pickupAddr} to ${shipment.deliveryAddr} is now available for $${shipment.price}`,
            data: {
              shipmentId,
              pickupAddr: shipment.pickupAddr,
              deliveryAddr: shipment.deliveryAddr,
              price: shipment.price,
              pickupLat: shipment.pickupLat,
              pickupLng: shipment.pickupLng,
              dropoffLat: shipment.dropoffLat,
              dropoffLng: shipment.dropoffLng,
              distanceKm: shipment.distanceKm,
            },
          });

          // Send push notification to driver
          await sendPushNotificationToUser(
            driver.userId,
            "New Shipment Available! 🚚",
            `Shipment from ${shipment.pickupAddr} to ${shipment.deliveryAddr} - $${shipment.price}`,
            {
              shipmentId,
              type: "SHIPMENT_AVAILABLE",
              pickupAddr: shipment.pickupAddr,
              deliveryAddr: shipment.deliveryAddr,
              price: shipment.price,
            }
          );
        });

        await Promise.all(notificationPromises);
        console.log(
          `✅ Created notifications for ${nearbyDrivers.length} nearby drivers`
        );
      } else {
        console.log("ℹ️ No available online drivers found nearby");
      }
    }

    // Get socket.io instance
    const io = getIO();

    // Prepare notification data
    const notificationData = {
      shipmentId,
      status: newStatus,
      action: actionType,
      reason: cancellationReason || "No reason provided",
      cancelledBy: req.user.id,
      cancelledByRole: req.user.role,
      timestamp: new Date(),
    };

    // Notify the driver if assigned and not the one cancelling (via socket)
    if (shipment.driverId && !isDriver) {
      io.to(shipment.driver.userId).emit("shipment-cancelled", {
        ...notificationData,
        message: `Shipment #${shipmentId.slice(0, 8)} has been ${actionType}`,
        customerName: shipment.customer?.name || "Customer",
      });
    }

    // Notify the customer if not the one cancelling (via socket)
    if (!isCustomer) {
      io.to(shipment.customerId).emit("shipment-cancelled", {
        ...notificationData,
        message: notifyMessage,
        cancelledBy: isAdmin ? "Admin" : isDriver ? "Driver" : "Unknown",
      });
    }

    // Broadcast to admins for monitoring
    io.emit("shipment-cancelled-admin", {
      shipmentId,
      customerId: shipment.customerId,
      driverId: shipment.driverId,
      cancelledBy: req.user.id,
      cancelledByRole: req.user.role,
      action: actionType,
      reason: cancellationReason || "No reason provided",
      timestamp: new Date(),
      previousStatus: shipment.status,
      newStatus: newStatus,
    });

    // If released back to AVAILABLE, notify all drivers that a new shipment is available
    if (newStatus === "AVAILABLE") {
      io.emit("shipment-available", {
        shipmentId,
        shipment: {
          pickupAddr: shipment.pickupAddr,
          deliveryAddr: shipment.deliveryAddr,
          price: shipment.price,
          pickupLat: shipment.pickupLat,
          pickupLng: shipment.pickupLng,
        },
        message:
          "A shipment has been released and is now available for pickup!",
      });
    }

    res.json({
      success: true,
      message: `Shipment ${actionType} successfully`,
      action: actionType,
      shipment: {
        id: updatedShipment.id,
        status: updatedShipment.status,
        cancelledAt: updatedShipment.cancelledAt,
        cancelledBy: updatedShipment.cancelledBy,
        cancellationReason: updatedShipment.cancellationReason,
      },
    });
  } catch (error) {
    console.error("Error cancelling shipment:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
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
