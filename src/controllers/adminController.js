const prisma = require("../lib/prisma");

const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        driver: {
          include: {
            documents: true,
          },
        },
        // If you have an admin model
        // admin: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Format the response
    const formattedUsers = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Include driver data if role is DRIVER
      driverData:
        user.role === "DRIVER"
          ? {
              id: user.driver?.id,
              vehicleType: user.driver?.vehicleType,
              vehicleMake: user.driver?.vehicleMake,
              vehicleModel: user.driver?.vehicleModel,
              vehicleYear: user.driver?.vehicleYear,
              isOnline: user.driver?.isOnline,
              status: user.driver?.status,
              latitude: user.driver?.latitude,
              longitude: user.driver?.longitude,
              rating: user.driver?.rating,
              profilePhotoUrl: user.driver?.documents?.profilePhotoUrl || null,
            }
          : null,
    }));

    res.json({
      success: true,
      count: formattedUsers.length,
      users: formattedUsers,
    });
  } catch (error) {
    console.error("Error fetching all users:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getUserById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        driver: {
          include: {
            documents: true,
            shipments: {
              include: {
                customer: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                  }
                },
                interests: true,
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        },
        shipments: {
          include: {
            driver: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                  }
                },
                documents: true,
              },
            },
            interests: {
              include: {
                driver: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                      }
                    }
                  }
                }
              }
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        admin: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Format shipment function
    const formatShipment = (shipment, role = 'customer') => ({
      id: shipment.id,
      pickupAddress: shipment.pickupAddr,
      deliveryAddress: shipment.deliveryAddr,
      pickupLat: shipment.pickupLat,
      pickupLng: shipment.pickupLng,
      dropoffLat: shipment.dropoffLat,
      dropoffLng: shipment.dropoffLng,
      distanceKm: shipment.distanceKm,
      description: shipment.description,
      requiredVehicle: shipment.requiredVehicle,
      specialInstructions: shipment.specialInstructions,
      price: shipment.price,
      status: shipment.status,
      proofPhotoUrl: shipment.proofPhotoUrl,
      proofSignatureUrl: shipment.proofSignatureUrl,
      deliveredAt: shipment.deliveredAt,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
      
      // Customer info (always include)
      customer: {
        id: shipment.customer?.id,
        name: shipment.customer?.name,
        email: shipment.customer?.email,
        phone: shipment.customer?.phone,
      },
      
      // Driver info if assigned
      driver: shipment.driver ? {
        id: shipment.driver.id,
        userId: shipment.driver.userId,
        vehicleType: shipment.driver.vehicleType,
        vehicleMake: shipment.driver.vehicleMake,
        vehicleModel: shipment.driver.vehicleModel,
        vehicleYear: shipment.driver.vehicleYear,
        rating: shipment.driver.rating,
        isOnline: shipment.driver.isOnline,
        status: shipment.driver.status,
        user: shipment.driver.user ? {
          name: shipment.driver.user.name,
          email: shipment.driver.user.email,
          phone: shipment.driver.user.phone,
        } : null,
        documents: shipment.driver.documents ? {
          licenseUrl: shipment.driver.documents.licenseUrl,
          insuranceUrl: shipment.driver.documents.insuranceUrl,
          registrationUrl: shipment.driver.documents.registrationUrl,
          profilePhotoUrl: shipment.driver.documents.profilePhotoUrl,
          vehiclePhotoUrl: shipment.driver.documents.vehiclePhotoUrl,
        } : null,
      } : null,
      
      // Driver info when viewing as driver (role-specific)
      driverInfo: role === 'driver' && shipment.driver ? {
        id: shipment.driver.id,
        vehicleType: shipment.driver.vehicleType,
        vehicleMake: shipment.driver.vehicleMake,
        vehicleModel: shipment.driver.vehicleModel,
      } : null,
      
      // Interests/bids on this shipment
      interests: shipment.interests?.map(interest => ({
        id: interest.id,
        driverId: interest.driverId,
        createdAt: interest.createdAt,
        driver: interest.driver ? {
          id: interest.driver.id,
          userId: interest.driver.userId,
          vehicleType: interest.driver.vehicleType,
          user: interest.driver.user ? {
            name: interest.driver.user.name,
            email: interest.driver.user.email,
            phone: interest.driver.user.phone,
          } : null,
        } : null,
      })) || [],
      
      interestCount: shipment.interests?.length || 0,
    });

    const formattedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      
      // Admin data if role is ADMIN
      adminData: user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? {
        id: user.admin?.id,
        userId: user.admin?.userId,
        isActive: user.admin?.isActive,
      } : null,
      
      // Driver data if role is DRIVER
      driverData: user.role === "DRIVER" ? {
        id: user.driver?.id,
        userId: user.driver?.userId,
        vehicleType: user.driver?.vehicleType,
        vehicleMake: user.driver?.vehicleMake,
        vehicleModel: user.driver?.vehicleModel,
        vehicleYear: user.driver?.vehicleYear,
        isOnline: user.driver?.isOnline,
        status: user.driver?.status,
        latitude: user.driver?.latitude,
        longitude: user.driver?.longitude,
        totalEarnings: user.driver?.totalEarnings,
        searchRadius: user.driver?.searchRadius,
        socketId: user.driver?.socketId,
        profilePhotoUrl: user.driver?.documents?.profilePhotoUrl || null,
        licenseUrl: user.driver?.documents?.licenseUrl || null,
        insuranceUrl: user.driver?.documents?.insuranceUrl || null,
        registrationUrl: user.driver?.documents?.registrationUrl || null,
        vehiclePhotoUrl: user.driver?.documents?.vehiclePhotoUrl || null,
        lastLocationUpdate: user.driver?.documents?.lastLocationUpdate || null,
      } : null,
      
      // Shipments where user is customer
      shipmentsAsCustomer: user.shipments?.map(s => formatShipment(s, 'customer')) || [],
      
      // Shipments where user is driver (only for DRIVER role)
      shipmentsAsDriver: user.role === "DRIVER" && user.driver?.shipments
        ? user.driver.shipments.map(s => formatShipment(s, 'driver'))
        : [],
      
      // Shipment statistics
      shipmentStats: {
        // As customer
        totalAsCustomer: user.shipments?.length || 0,
        availableAsCustomer: user.shipments?.filter(s => s.status === 'AVAILABLE').length || 0,
        pendingAsCustomer: user.shipments?.filter(s => s.status === 'PENDING').length || 0,
        assignedAsCustomer: user.shipments?.filter(s => s.status === 'ASSIGNED').length || 0,
        pickedUpAsCustomer: user.shipments?.filter(s => s.status === 'PICKED_UP').length || 0,
        inTransitAsCustomer: user.shipments?.filter(s => s.status === 'IN_TRANSIT').length || 0,
        deliveredAsCustomer: user.shipments?.filter(s => s.status === 'DELIVERED').length || 0,
        cancelledAsCustomer: user.shipments?.filter(s => s.status === 'CANCELLED').length || 0,
        
        // As driver (if applicable)
        totalAsDriver: user.role === "DRIVER" && user.driver?.shipments 
          ? user.driver.shipments.length 
          : 0,
        availableAsDriver: user.role === "DRIVER" && user.driver?.shipments
          ? user.driver.shipments.filter(s => s.status === 'AVAILABLE').length
          : 0,
        pendingAsDriver: user.role === "DRIVER" && user.driver?.shipments
          ? user.driver.shipments.filter(s => s.status === 'PENDING').length
          : 0,
        assignedAsDriver: user.role === "DRIVER" && user.driver?.shipments
          ? user.driver.shipments.filter(s => s.status === 'ASSIGNED').length
          : 0,
        pickedUpAsDriver: user.role === "DRIVER" && user.driver?.shipments
          ? user.driver.shipments.filter(s => s.status === 'PICKED_UP').length
          : 0,
        inTransitAsDriver: user.role === "DRIVER" && user.driver?.shipments
          ? user.driver.shipments.filter(s => s.status === 'IN_TRANSIT').length
          : 0,
        deliveredAsDriver: user.role === "DRIVER" && user.driver?.shipments
          ? user.driver.shipments.filter(s => s.status === 'DELIVERED').length
          : 0,
        cancelledAsDriver: user.role === "DRIVER" && user.driver?.shipments
          ? user.driver.shipments.filter(s => s.status === 'CANCELLED').length
          : 0,
        
        // Earnings
        totalEarnings: user.driver?.totalEarnings || 0,
      },
      
      // Active shipments (not delivered or cancelled)
      activeShipmentsAsCustomer: user.shipments?.filter(s => 
        !['DELIVERED', 'CANCELLED'].includes(s.status)
      )?.map(s => formatShipment(s, 'customer')) || [],
      
      activeShipmentsAsDriver: user.role === "DRIVER" && user.driver?.shipments
        ? user.driver.shipments.filter(s => !['DELIVERED', 'CANCELLED'].includes(s.status))
          .map(s => formatShipment(s, 'driver'))
        : [],
    };

    return res.json({
      success: true,
      user: formattedUser,
    });
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAllDrivers = async (req, res) => {
  try {
    const drivers = await prisma.driver.findMany({
      include: {
        user: true,
        documents: true,
      },
    });

    res.json({ success: true, drivers });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getPendingDrivers = async (req, res) => {
  try {
    const drivers = await prisma.driver.findMany({
      where: {
        status: "PENDING",
      },
      include: {
        user: true,
        documents: true,
      },
    });

    res.json({ success: true, drivers });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const approveDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    const updated = await prisma.driver.update({
      where: { id: driverId },
      data: { status: "ACTIVE" },
    });

    res.json({
      success: true,
      message: "Driver approved",
      driver: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const rejectDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        status: "SUSPENDED",
        vehicleMake: null,
        vehicleModel: null,
        vehicleYear: null,
      },
    });

    res.json({
      success: true,
      message: "Driver rejected",
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
  const { id } = req.params; // driver ID
  const { status } = req.body;
  
  // Validate status
  const validStatuses = ['AVAILABLE', 'PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED'];
  
  if (!status) {
    return res.status(400).json({
      success: false,
      message: "Status is required",
    });
  }
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status. Must be: AVAILABLE, PENDING, VERIFIED, ACTIVE, or SUSPENDED",
    });
  }
  
  try {
    // Check if driver exists
    const driver = await prisma.driver.findUnique({
      where: { id }
    });
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }
    
    // Update status
    const updatedDriver = await prisma.driver.update({
      where: { id },
      data: { status },
    });
    
    return res.json({
      success: true,
      message: `Driver status updated to ${status}`,
      driver: {
        id: updatedDriver.id,
        status: updatedDriver.status,
        updatedAt: updatedDriver.updatedAt,
      },
    });
    
  } catch (error) {
    console.error("Error updating driver status:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


const updateUserStatus = async (req, res) => {
  const { id } = req.params; // user ID
  const { status } = req.body;
  
  // Validate status
  const validStatuses = ['PENDING', 'CONFIRMED', 'SUSPENDED'];
  
  if (!status) {
    return res.status(400).json({
      success: false,
      message: "Status is required",
    });
  }
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status. Must be: PENDING, CONFIRMED, or SUSPENDED",
    });
  }
  
  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    
    // Update status
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status },
    });
    
    return res.json({
      success: true,
      message: `User status updated to ${status}`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        status: updatedUser.status,
        updatedAt: updatedUser.updatedAt,
      },
    });
    
  } catch (error) {
    console.error("Error updating user status:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


const addAdmin = async (req, res) => {
  console.log("add admin was called");
  
  const { name, email, password, phone, role } = req.body;
  console.log("User data:", { name, email, phone, role});
  
  // Validate required fields
  if (!name || !email || !password || !phone || !role) {
    return res.status(400).json({
      success: false,
      message: "All fields are required: name, email, password, phone",
    });
  }
  
  try {
    // Check if user already exists with this email or phone
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { phone: phone }
        ]
      }
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email or phone",
      });
    }
    
    // Hash password (assuming you're using bcrypt)
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user with ADMIN role
    const user = await prisma.user.create({
      data: {
        name: name,
        email: email,
        phone: phone,
        password: hashedPassword,
        role: role,
        status: "CONFIRMED",
      }
    });
    
    // Create admin record
    const admin = await prisma.admin.create({
      data: {
        userId: user.id,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
          }
        }
      }
    });
    
    // Remove password from response
    const { password: _, ...userWithoutPassword } = admin.user;
    
    return res.status(201).json({
      success: true,
      message: "Admin created successfully",
      user: userWithoutPassword,
      admin: {
        id: admin.id,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
      }
    });
    
  } catch (error) {
    console.error("Error adding admin:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// Remove admin
const removeAdmin = async (req, res) => {
  const { id } = req.params; // admin ID
  
  try {
    // Check if admin exists
    const admin = await prisma.admin.findUnique({
      where: { id },
      include: { user: true }
    });
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }
    
    // Delete admin
    await prisma.admin.delete({
      where: { id }
    });
    
    // Update user role back to CUSTOMER
    await prisma.user.update({
      where: { id: admin.userId },
      data: { role: "CUSTOMER" }
    });
    
    return res.json({
      success: true,
      message: "Admin removed successfully",
    });
    
  } catch (error) {
    console.error("Error removing admin:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all admins
const getAllAdmins = async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    return res.json({
      success: true,
      count: admins.length,
      admins: admins,
    });
    
  } catch (error) {
    console.error("Error fetching admins:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};




module.exports = {
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
};
