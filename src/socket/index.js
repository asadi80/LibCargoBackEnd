// socket.js
const { Server } = require("socket.io");
const { distanceKm } = require("../utils/geo");
const prisma = require("../lib/prisma");

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // 👤 DRIVER JOINS
    socket.on("join", (driverId) => {
      socket.join(`driver_${driverId}`);
      console.log(`🚚 Driver ${driverId} joined room`);
    });

    // 🚚 DRIVER ONLINE
    socket.on("driver-online", ({ driverId }) => {
      socket.join("drivers");
      console.log(`🚚 Driver ${driverId} is online`);
    });

    // 📍 DRIVER LOCATION (broadcast to map)
    socket.on("driver-location", (data) => {
      console.log(`📍 Driver ${data.driverId} location update`);
      io.emit("driver-location-update", data);
    });

    // 🚚 DRIVER STATUS CHANGE
    socket.on("driver-status-change", ({ driverId, isOnline }) => {
      console.log(`📡 Driver ${driverId} status changed to: ${isOnline}`);
      io.emit("driver-status-changed", { driverId, isOnline });
    });

    // 📦 CUSTOMER POSTS SHIPMENT
    socket.on("create-shipment", async (shipment) => {
      const nearbyDrivers = await getDriversNear(
        shipment.pickupLat,
        shipment.pickupLng,
        10
      );

      // send shipment to ALL nearby drivers
      nearbyDrivers.forEach((driver) => {
        io.to(driver.socketId).emit("new-shipment", shipment);
      });
    });

    // 🚚 DRIVER ACCEPTS
    socket.on("accept-shipment", async ({ shipmentId, driverId }) => {
      const room = `shipment_${shipmentId}`;
      socket.join(room);
      io.to(room).emit("shipment-accepted", {
        shipmentId,
        driverId,
      });
    });

    socket.on("disconnect", () => {
      console.log('🔌 Client disconnected:', socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

module.exports = { initSocket, getIO };