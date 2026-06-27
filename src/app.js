require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const shipmentRoutes = require("./routes/shipmentRoutes");
const driverRoutes = require("./routes/driverRoutes");
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/driver", driverRoutes);
app.use('/api/notifications', notificationRoutes);

app.get("/", (req, res) => {
  res.json({
    status: "running",
  });
});

module.exports = app;
