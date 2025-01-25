const express = require("express");
const http = require("http");
const { Server } = require("socket.io");


let nanoid;
(async () => {
  const module = await import("nanoid");
  nanoid = module.nanoid;
})();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let activeRoom = null;
let roomCreatorId = null;

app.use(express.static("public"));

app.get("/create-room", async (req, res) => {
  if (activeRoom) {
    return res
      .status(400)
      .json({ error: "A room is already active. Join the existing room." });
  }
  activeRoom = nanoid(8);
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

      socket.on("chat message", ({ sender, msg }) => {
        socket.broadcast.to(roomId).emit("chat message", { sender, msg });
      });

      socket.on("close-room", () => {
  if (socket.id === roomCreatorId) {
    io.to(activeRoom).emit("room-closed");
    io.socketsLeave(activeRoom); // Make sure all clients leave the room
    activeRoom = null;           // Clear the active room
    roomCreatorId = null;       // Clear the room creator ID
    console.log("Room closed by creator");

    // To make sure the next room can be created
    setTimeout(() => {
      console.log("Ready for new room creation");
    }, 500); // Timeout to ensure the state is cleared
  } else {
    socket.emit("error", "Only the room creator can close the room.");
  }
});


      socket.on("disconnect", () => {
        console.log("User disconnected");
        // Emit user left message
        socket.broadcast
          .to(roomId)
          .emit("user-status", `${userName} has left the room`);
      });
    } else {
      socket.emit("error", "Room does not exist or has been closed");
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
