const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { nanoid } = require("nanoid"); // Synchronous import

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const cors = require('cors');

let activeRoom = null;
let roomCreatorId = null;
let roomInactivityTimer = null; // Timer for inactivity

const INACTIVITY_LIMIT = 7 * 60 * 1000; // 7 minutes in milliseconds

app.use(express.static("public"));
app.use(cors());

app.get("/create-room", (req, res) => {
  if (activeRoom) {
    return res
      .status(400)
      .json({ error: "A room is already active. Join the existing room." });
  }
  activeRoom = nanoid(8);
  resetInactivityTimer(); // Start inactivity timer when the room is created
  res.json({ roomId: activeRoom });
});

app.get("/check-room", (req, res) => {
  res.json({ roomId: activeRoom });
});

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("join-room", ({ roomId, userName }) => {
    if (roomId === activeRoom) {
      socket.join(roomId);
      console.log(`${userName} joined room: ${roomId}`);

      // Emit user joined message
      socket.broadcast
        .to(roomId)
        .emit("user-status", `${userName} has joined the room`);

      if (!roomCreatorId) {
        roomCreatorId = socket.id;
      }

      resetInactivityTimer(); // Reset timer when a user joins

      socket.on("chat message", ({ sender, msg }) => {
        socket.broadcast.to(roomId).emit("chat message", { sender, msg });
        resetInactivityTimer(); // Reset timer on chat activity
      });

      socket.on("close-room", () => {
        if (socket.id === roomCreatorId) {
          closeRoom(); // Close the room explicitly
        } else {
          socket.emit("error", "Only the room creator can close the room.");
        }
      });

      socket.on("disconnect", () => {
        console.log(`${userName} disconnected`);

        // Emit user left message
        socket.broadcast
          .to(roomId)
          .emit("user-status", `${userName} has left the room`);

        // If room creator disconnects, wait for inactivity timeout
        if (socket.id === roomCreatorId) {
          console.log("Room creator disconnected, relying on inactivity timer");
        }
      });
    } else {
      socket.emit("error", "Room does not exist or has been closed");
    }
  });
});

function closeRoom() {
  if (activeRoom) {
    io.to(activeRoom).emit("room-closed");
    io.socketsLeave(activeRoom); // Make all clients leave the room
    activeRoom = null; // Clear the active room
    roomCreatorId = null; // Clear the room creator ID
    clearTimeout(roomInactivityTimer); // Stop the inactivity timer
    console.log("Room closed due to inactivity or by creator");
  }
}

function resetInactivityTimer() {
  clearTimeout(roomInactivityTimer); // Clear the previous timer
  roomInactivityTimer = setTimeout(() => {
    console.log("Room closed due to inactivity");
    closeRoom(); // Close the room after inactivity
  }, INACTIVITY_LIMIT);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
