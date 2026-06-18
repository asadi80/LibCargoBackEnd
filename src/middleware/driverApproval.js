const prisma = require("../lib/prisma");

const requireApprovedDriver = async (req, res, next) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found",
      });
    }

    // Allow AVAILABLE, ACTIVE, VERIFIED status
    // Only block PENDING
    const allowedStatuses = ["AVAILABLE", "ACTIVE", "VERIFIED"];
    
    if (driver.status === "PENDING") {
      return res.status(403).json({
        success: false,
        message: "Driver profile is pending admin approval. Please wait for verification.",
      });
    }

    req.driver = driver;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = requireApprovedDriver;