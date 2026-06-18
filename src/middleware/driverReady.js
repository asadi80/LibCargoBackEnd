const prisma = require("../lib/prisma");

const driverReady = async (req, res, next) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: {
        userId: req.user.id,
      },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    if (!driver.vehicleMake || !driver.vehicleModel || !driver.vehicleYear) {
      return res.status(400).json({
        success: false,
        message: "Complete your vehicle profile first",
      });
    }

    if (driver.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Driver not approved by admin",
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = driverReady;
