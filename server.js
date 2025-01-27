const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// Configure CORS for Express and Socket.IO
app.use(cors({
  origin: "*", // Allow all origins during development
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
  credentials: true, // Allow credentials if needed
}));

const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins during development
    methods: ["GET", "POST"],
  },
});

let activeRoom = null;
let roomCreatorId = null;
let roomInactivityTimer = null;

const INACTIVITY_LIMIT = 7 * 60 * 1000; // 7 minutes in milliseconds

// Serve static files if needed
app.use(express.static("public"));

// Route: Create a room
app.get("/create-room", (req, res) => {
  if (activeRoom) {
    return res.status(400).json({
      error: "A room is already active. Join the existing room.",
    });
  }
  activeRoom = nanoid(8);
  resetInactivityTimer(); // Start inactivity timer when the room is created
  res.json({ roomId: activeRoom });
});

// Route: Check room status
app.get("/check-room", (req, res) => {
  res.json({ roomId: activeRoom });
});

// Socket.IO logic
io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("join-room", ({ roomId, userName }) => {
    if (roomId === activeRoom) {
      socket.join(roomId);
      console.log(`${userName} joined room: ${roomId}`);

      socket.broadcast.to(roomId).emit("user-status", `${userName} has joined`);

      if (!roomCreatorId) {
        roomCreatorId = socket.id;
      }

      resetInactivityTimer();

      socket.on("chat message", ({ sender, msg }) => {
        console.log(`Message from ${sender}: ${msg}`);
        socket.broadcast.to(roomId).emit("chat message", { sender, msg });
        resetInactivityTimer();
      });

      socket.on("close-room", () => {
        if (socket.id === roomCreatorId) {
          closeRoom();
        } else {
          socket.emit("error", "Only the room creator can close the room.");
        }
      });

      socket.on("disconnect", () => {
        console.log(`${userName} disconnected`);
        socket.broadcast.to(roomId).emit("user-status", `${userName} has left`);

        if (socket.id === roomCreatorId) {
          console.log("Room creator disconnected, relying on inactivity timer");
        }
      });
    } else {
      socket.emit("error", "Room does not exist or has been closed");
    }
  });
});

// Close the room
function closeRoom() {
  if (activeRoom) {
    io.to(activeRoom).emit("room-closed");
    io.socketsLeave(activeRoom);
    activeRoom = null;
    roomCreatorId = null;
    clearTimeout(roomInactivityTimer);
    console.log("Room closed due to inactivity or by creator");
  }
}

// Reset the inactivity timer
function resetInactivityTimer() {
  clearTimeout(roomInactivityTimer);
  roomInactivityTimer = setTimeout(() => {
    console.log("Room closed due to inactivity");
    closeRoom();
  }, INACTIVITY_LIMIT);
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
