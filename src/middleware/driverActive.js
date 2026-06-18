const prisma = require("../lib/prisma");

const driverActive = async (req, res, next) => {
  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.id },
    });

    if (!driver || driver.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Driver not active",
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

module.exports = driverActive;
