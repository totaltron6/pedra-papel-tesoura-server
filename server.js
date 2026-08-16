const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const rooms = new Map();

function generateRoomCode() {
  let code;

  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));

  return code;
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastRoom(room, data) {
  room.players.forEach((player) => {
    send(player.ws, data);
  });
}

function removePlayerFromRoom(ws) {
  const roomCode = ws.roomCode;

  if (!roomCode || !rooms.has(roomCode)) {
    return;
  }

  const room = rooms.get(roomCode);

  room.players = room.players.filter((player) => player.ws !== ws);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    return;
  }

  broadcastRoom(room, {
    type: "player_left"
  });

  if (room.players.length === 1) {
    room.players[0].role = "player1";

    send(room.players[0].ws, {
      type: "waiting_for_player"
    });
  }

  ws.roomCode = null;
}

wss.on("connection", (ws) => {
  console.log("Novo jogador conectado");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "create_room") {
        const roomCode = generateRoomCode();

        const room = {
          players: [
            {
              ws: ws,
              role: "player1"
            }
          ]
        };

        rooms.set(roomCode, room);
        ws.roomCode = roomCode;

        send(ws, {
          type: "room_created",
          roomCode: roomCode,
          role: "player1"
        });

        return;
      }

      if (data.type === "join_room") {
        const roomCode = String(data.roomCode);

        if (!rooms.has(roomCode)) {
          send(ws, {
            type: "room_not_found"
          });

          return;
        }

        const room = rooms.get(roomCode);

        if (room.players.length >= 2) {
          send(ws, {
            type: "room_full"
          });

          return;
        }

        room.players.push({
          ws: ws,
          role: "player2"
        });

        ws.roomCode = roomCode;

        send(ws, {
          type: "room_joined",
          roomCode: roomCode,
          role: "player2"
        });

        broadcastRoom(room, {
          type: "game_start"
        });

        return;
      }

      if (data.type === "game_state") {
        if (!ws.roomCode || !rooms.has(ws.roomCode)) {
          return;
        }

        const room = rooms.get(ws.roomCode);

        room.players.forEach((player) => {
          if (player.ws !== ws) {
            send(player.ws, {
              type: "opponent_state",
              state: data.state
            });
          }
        });

        return;
      }

      if (data.type === "player_action") {
        if (!ws.roomCode || !rooms.has(ws.roomCode)) {
          return;
        }

        const room = rooms.get(ws.roomCode);

        room.players.forEach((player) => {
          if (player.ws !== ws) {
            send(player.ws, {
              type: "opponent_action",
              action: data.action
            });
          }
        });

        return;
      }
    } catch (error) {
      console.log("Erro ao processar mensagem:", error);
    }
  });

  ws.on("close", () => {
    console.log("Jogador desconectado");
    removePlayerFromRoom(ws);
  });

  ws.on("error", () => {
    removePlayerFromRoom(ws);
  });
});

app.get("/", (req, res) => {
  res.send("Servidor multiplayer online!");
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
