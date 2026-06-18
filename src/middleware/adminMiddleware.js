const adminOnly = (req, res, next) => {
  if (req.user.role !== "ADMIN" || req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Access denied: Admins only",
    });
  }

  next();
};

module.exports = { adminOnly };
