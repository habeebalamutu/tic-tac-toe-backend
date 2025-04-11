const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", (roomCode, name) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        board: Array(9).fill(null),
        turn: 0,
        score: { X: 0, O: 0 },
        starterIndex: 0,
      };
    }

    const room = rooms[roomCode];

    if (room.players.length >= 2) return;

    const symbol = room.players.length === 0 ? "X" : "O";

    room.players.push({
      id: socket.id,
      name,
      symbol,
    });

    socket.join(roomCode);

    io.to(roomCode).emit("playerJoined", room.players);
    io.to(roomCode).emit("gameState", room.board);

    if (room.players.length === 2) {
      const starter = room.players[room.starterIndex];
      io.to(roomCode).emit("notification", {
        message: `Game started! ${starter.name} goes first.`,
      });
    }
  });

  socket.on("playerMove", (index) => {
    let roomCode = null;

    for (const code in rooms) {
      const room = rooms[code];
      if (room.players.find((p) => p.id === socket.id)) {
        roomCode = code;
        break;
      }
    }

    if (!roomCode) return;
    const room = rooms[roomCode];
    const player = room.players.find((p) => p.id === socket.id);
    const currentSymbol = room.turn % 2 === 0 ? "X" : "O";

    if (player.symbol !== currentSymbol || room.board[index]) return;

    room.board[index] = player.symbol;
    room.turn++;

    io.to(roomCode).emit("gameState", room.board);

    const winner = checkWinner(room.board);
    if (winner) {
      room.score[winner]++;
      io.to(roomCode).emit("gameOver", player.name);
      io.to(roomCode).emit("updateScore", room.score);

      socket.emit("notification", {
        message: `Congratulations ${player.name}! You are the winner!`,
      });

      const loser = room.players.find((p) => p.id !== socket.id);
      if (loser) {
        io.to(loser.id).emit("notification", {
          message: `Sorry ${loser.name}, you lost this round.`,
        });
      }

      setTimeout(() => {
        room.board = Array(9).fill(null);
        room.starterIndex = 1 - room.starterIndex;
        room.turn = room.starterIndex;

        io.to(roomCode).emit("gameState", room.board);
        const newStarter = room.players[room.starterIndex];
        io.to(roomCode).emit("notification", {
          message: `${winner} wins! Next round starting... ${newStarter.name} goes first.`,
        });
      }, 2500);
    } else if (!room.board.includes(null)) {
      io.to(roomCode).emit("gameOver", "Draw");

      setTimeout(() => {
        room.board = Array(9).fill(null);
        room.starterIndex = 1 - room.starterIndex;
        room.turn = room.starterIndex;

        io.to(roomCode).emit("gameState", room.board);
        const newStarter = room.players[room.starterIndex];
        io.to(roomCode).emit("notification", {
          message: "It's a draw! Next round starting... " + newStarter.name + " goes first.",
        });
      }, 2500);
    }
  });

  socket.on("sendMessage", ({ name, message, room }) => {
    io.to(room).emit("chatMessage", { name, message });
  });

  socket.on("disconnect", () => {
    for (const code in rooms) {
      const room = rooms[code];
      const index = room.players.findIndex((p) => p.id === socket.id);
      if (index !== -1) {
        const player = room.players[index];
        room.players.splice(index, 1);
        io.to(code).emit("chatMessage", {
          name: "System",
          message: `${player.name} left the game.`,
        });
        io.to(code).emit("playerJoined", room.players);

        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          room.board = Array(9).fill(null);
          io.to(code).emit("gameState", room.board);
        }
        break;
      }
    }
  });
});

function checkWinner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (let [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

server.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
