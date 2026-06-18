const prisma = require("../lib/prisma");
const { getIO } = require("../socket");

const createDriverProfile = async (req, res) => {
  try {
    const { vehicleMake, vehicleModel, vehicleYear } = req.body;

    const existingDriver = await prisma.driver.findUnique({
      where: {
        userId: req.user.id,
      },
    });

    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: "Driver profile already exists",
      });
    }

    const driver = await prisma.driver.create({
      data: {
        userId: req.user.id,
        vehicleMake,
        vehicleModel,
        vehicleYear: vehicleYear ? Number(vehicleYear) : null,
      },
    });

    res.json({
      success: true,
      driver,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const uploadDocuments = async (req, res) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    const { licenseUrl, insuranceUrl, registrationUrl, profilePhotoUrl, vehiclePhotoUrl } = req.body;

    if (!licenseUrl && !insuranceUrl && !registrationUrl && !profilePhotoUrl && !vehiclePhotoUrl) {
      return res.status(400).json({
        success: false,
        message: "No document URLs provided",
      });
    }

    const doc = await prisma.driverDocument.upsert({
      where: {
        driverId: driver.id,
      },
      update: {
        ...(licenseUrl      && { licenseUrl }),
        ...(insuranceUrl    && { insuranceUrl }),
        ...(registrationUrl && { registrationUrl }),
        ...(profilePhotoUrl && { profilePhotoUrl }),
        ...(vehiclePhotoUrl && { vehiclePhotoUrl }),
      },
      create: {
        driverId:        driver.id,
        licenseUrl,
        insuranceUrl,
        registrationUrl,
        profilePhotoUrl,
        vehiclePhotoUrl,
      },
    });

    res.json({
      success: true,
      documents: doc,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


const updateVehicleInfo = async (req, res) => {
  console.log("vehicale info route");
  
  try {
    const { vehicleType, vehicleMake, vehicleModel, vehicleYear } = req.body;

    const driver = await prisma.driver.update({
      where: { userId: req.user.id },
      data: { vehicleType, vehicleMake, vehicleModel, vehicleYear },
    });

    res.json({ success: true, driver });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    const driver = await prisma.driver.update({
      where: { userId: req.user.id },
      data: { latitude, longitude },
    });

    // Emit location update via socket if available
    try {
      const io = getIO();
      if (io) {
        io.emit("driver-location-update", {
          driverId: driver.id,
          latitude,
          longitude,
        });
      }
    } catch (socketError) {
      console.log('Socket not available, skipping emit:', socketError.message);
      // Don't fail the request if socket fails
    }

    res.json({
      success: true,
      driver,
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateDriverProfile = async (req, res) => {
  try {
    const { vehicleMake, vehicleModel, vehicleYear } = req.body;

    const driver = await prisma.driver.update({
      where: {
        userId: req.user.id,
      },
      data: {
        vehicleMake,
        vehicleModel,
        vehicleYear: vehicleYear ? Number(vehicleYear) : null,
      },
    });

    res.json({
      success: true,
      driver,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateDriverStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;

    // Get current driver
    const currentDriver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });

    if (!currentDriver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    // Update driver status
    const driver = await prisma.driver.update({
      where: { userId: req.user.id },
      data: { 
        isOnline,
        // Change status to AVAILABLE when going online, only if not already AVAILABLE
        ...(isOnline && currentDriver.status !== "AVAILABLE" && { status: "AVAILABLE" }),
        // Optionally set to something else when offline (maybe keep AVAILABLE or set to something else)
        ...(!isOnline && currentDriver.status === "AVAILABLE" && { status: "AVAILABLE" }) // Keep as AVAILABLE even when offline
      },
    });

    // Emit status change via socket
    try {
      const io = getIO();
      if (io) {
        io.emit("driver-status-changed", {
          driverId: driver.id,
          isOnline: driver.isOnline,
          status: driver.status,
        });
      }
    } catch (socketError) {
      console.log('Socket not available, skipping emit:', socketError.message);
    }

    res.json({ 
      success: true, 
      isOnline: driver.isOnline,
      status: driver.status
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

const getDriverProfile = async (req, res) => {
  // console.log("called profile driver");
  // console.log("User ID:", req.user.id);
  
  try {
    const driver = await prisma.driver.findUnique({
      where: {
        userId: req.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            // Exclude password field
          }
        },
        documents: true,
      },
    });
    
    console.log("Found driver profile route");

    res.json({
      success: true,
      driver,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getDriverById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await prisma.driver.findUnique({
      where: { id: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          }
        },
        documents: {
          select: {
            profilePhotoUrl: true,
            vehiclePhotoUrl: true,
          }
        },
      },
    });
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found"
      });
    }
    
    // Calculate total trips
    let totalTrips = 0;
    try {
      totalTrips = await prisma.shipment.count({
        where: { driverId: driver.id }
      });
    } catch (error) {
      console.log('Shipment table not found or error counting trips');
    }
    
    console.log("Found driver profile for ID:", id);
    
    res.json({
      success: true,
      driver: {
        driverId: driver.id,
        userId: driver.userId,
        name: driver.user.name,
       
        phone: driver.user.phone,
        // Vehicle info
        vehicleType: driver.vehicleType,
        vehicleMake: driver.vehicleMake,
        vehicleModel: driver.vehicleModel,
        vehicleYear: driver.vehicleYear,
        // Status
        isOnline: driver.isOnline,
        status: driver.status,
        // Location
        latitude: driver.latitude,
        longitude: driver.longitude,
        // Documents - explicitly extracted
        profilePhotoUrl: driver.documents?.profilePhotoUrl || null,
        vehiclePhotoUrl: driver.documents?.vehiclePhotoUrl || null,
        // Stats
        totalTrips: totalTrips,
        joinDate: driver.createdAt,
        rating: driver.rating || 4.5,
      },
    });
  } catch (error) {
    console.error("Error fetching driver by ID:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Add this function to your existing driver controller file
const getNearbyDrivers = async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = parseFloat(radius);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates"
      });
    }
    
    // Find all drivers that are online and have valid locations
    const drivers = await prisma.driver.findMany({
      where: {
        isOnline: true,
        status: "AVAILABLE", // Change to AVAILABLE since that's the enum value
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        user: {
          select: {
            name: true,
            phone: true,
            email: true,
          }
        }
      }
    });
    
    console.log(`🚚 Found ${drivers.length} available drivers with valid locations`);
    
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };
    
    const driversWithDistance = drivers
      .map(driver => {
        const distance = calculateDistance(
          latitude, longitude,
          driver.latitude, driver.longitude
        );
        
        return {
          driverId: driver.id,
          name: driver.user.name,
          phone: driver.user.phone,
          truckType: driver.vehicleType || "Standard",
          status: driver.isOnline ? "AVAILABLE" : "OFFLINE",
          latitude: driver.latitude,
          longitude: driver.longitude,
          rating: 4.5,
          distanceKm: parseFloat(distance.toFixed(2))
        };
      })
      .filter(driver => driver.distanceKm <= searchRadius)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    
    console.log(`📍 Found ${driversWithDistance.length} drivers within ${searchRadius}km radius`);
    
    res.json({
      success: true,
      count: driversWithDistance.length,
      drivers: driversWithDistance,
      userLocation: { lat: latitude, lng: longitude },
      searchRadius: searchRadius
    });
    
  } catch (error) {
    console.error('Error fetching nearby drivers:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// Also create a simplified version that just returns online drivers (no distance filter)
const getOnlineDrivers = async (req, res) => {
  try {
    const drivers = await prisma.driver.findMany({
      where: {
        isOnline: true,
        status: "ACTIVE",
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        user: {
          select: {
            name: true,
            phone: true,
          }
        }
      }
    });
    
    const formattedDrivers = drivers.map(driver => ({
      driverId: driver.id,
      name: driver.user.name,
      phone: driver.user.phone,
      truckType: driver.vehicleType || "Standard",
      status: "AVAILABLE",
      latitude: driver.latitude,
      longitude: driver.longitude,
      rating: 4.5,
    }));
    
    res.json({
      success: true,
      count: formattedDrivers.length,
      drivers: formattedDrivers
    });
    
  } catch (error) {
    console.error('Error fetching online drivers:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Add these to your module exports
module.exports = {
  createDriverProfile,
  uploadDocuments,
  updateLocation,
  updateDriverProfile,
  getDriverProfile,
  updateVehicleInfo,
  updateDriverStatus,
  getNearbyDrivers,   
  getOnlineDrivers,
  getDriverById
};