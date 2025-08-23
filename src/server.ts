import * as net from "net";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import * as path from "path";
import { IncomingMessage } from "http";

// --- Logger Setup ---
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
const logFile = path.join(logsDir, "connections.log");
const csvLogFile = path.join(logsDir, "user_registry.csv");
const csvHeader = "timestamp,nickname,userId,connectionType,ipAddress,port\n";

// Initialize CSV log if it doesn't exist
if (!fs.existsSync(csvLogFile)) {
  fs.writeFileSync(csvLogFile, csvHeader);
}

function logConnection(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, logMessage);
    console.log(message); // Also log to console for real-time view
  } catch (error) {
    console.error("Failed to write to log file:", error);
  }
}

function logUserToCsv(player: Player) {
  const timestamp = new Date().toISOString();
  let connectionType = "Unknown";
  let ipAddress = "N/A";
  let port: number | string = "N/A";

  if (player.connection instanceof net.Socket) {
    connectionType = "TCP";
    ipAddress = player.connection.remoteAddress || "N/A";
    port = player.connection.remotePort || "N/A";
  } else if (player.connection instanceof WebSocket) {
    connectionType = "WebSocket";
    ipAddress = wsIpMap.get(player.connection) || "N/A";
    port = "N/A"; // Client-side port is not directly available/relevant for WebSockets
  }

  const csvRow = `${timestamp},${player.nickname},${player.id},${connectionType},${ipAddress},${port}\n`;
  try {
    fs.appendFileSync(csvLogFile, csvRow);
  } catch (error) {
    console.error("Failed to write to CSV log file:", error);
  }
}

// --- Tipos e Interfaces ---

type ClientConnection = net.Socket | WebSocket;

interface Player {
  nickname: string;
  id: string;
  connection: ClientConnection;
  score: number;
}

type GameState = "LOBBY" | "IN_GAME" | "ROUND_OVER";

// --- Variáveis Globais ---

const players: Player[] = [];
const wsIpMap = new Map<WebSocket, string>(); // Map to store WebSocket IPs
const TCP_PORT = 2004; // ALterar para 2002 -> data de nascimento das crianças do grupo XDXD
const WS_PORT = 8080;
const HOST = "0.0.0.0"; // Escuta em todas as interfaces de rede disponíveis
const ROUND_DURATION = 60000; // 60 segundos

const wordList = [
  "Casa",
  "Carro",
  "Banana",
  "Computador",
  "Sol",
  "Livro",
  "Elefante",
  "Girafa",
];

let game: {
  state: GameState;
  currentDrawer: Player | null;
  currentWord: string;
  roundTimerId: NodeJS.Timeout | null;
} = {
  state: "LOBBY",
  currentDrawer: null,
  currentWord: "",
  roundTimerId: null,
};

// --- Lógica de Comunicação ---

function sendMessage(connection: ClientConnection, message: object) {
  const serializedMessage = JSON.stringify(message);
  if (connection instanceof net.Socket) {
    connection.write(serializedMessage);
  } else if (connection instanceof WebSocket) {
    connection.send(serializedMessage);
  }
}

function broadcast(message: object) {
  for (const player of players) {
    sendMessage(player.connection, message);
  }
}

function broadcastToOthers(origin: ClientConnection, message: object) {
  for (const player of players) {
    if (player.connection !== origin) {
      sendMessage(player.connection, message);
    }
  }
}

function broadcastPlayerList() {
  const playerList = players.map((p) => ({
    nickname: p.nickname,
    score: p.score,
  }));
  broadcast({ action: "update_players", players: playerList });
}

// --- Lógica do Jogo ---

function clearRoundTimer() {
  if (game.roundTimerId) {
    clearTimeout(game.roundTimerId);
    game.roundTimerId = null;
  }
}

function startNextRound() {
  clearRoundTimer();
  broadcast({ action: "game_stop", reason: "" }); // Reseta a UI do cliente

  broadcast({
    action: "chat_message",
    from: "Servidor",
    text: `Próxima rodada em 5 segundos...`,
    type: "system",
  });

  setTimeout(() => {
    if (players.length >= 2) {
      startGame();
    } else {
      stopGame("Jogadores insuficientes para continuar.");
    }
  }, 5000); // Espera 5 segundos para a próxima rodada
}

function startGame() {
  if (players.length < 2) {
    broadcast({
      action: "game_error",
      message: "São necessários pelo menos 2 jogadores para começar.",
    });
    return;
  }

  clearRoundTimer(); // Garante que não haja timers antigos
  game.state = "IN_GAME";
  const drawerIndex = Math.floor(Math.random() * players.length);
  game.currentDrawer = players[drawerIndex];
  const wordIndex = Math.floor(Math.random() * wordList.length);
  game.currentWord = wordList[wordIndex];

  logConnection(
    `Nova rodada! Desenhista: ${game.currentDrawer.nickname}, Palavra: ${game.currentWord}`
  );

  sendMessage(game.currentDrawer.connection, {
    action: "your_turn",
    word: game.currentWord,
  });

  broadcast({
    action: "game_start",
    drawer: game.currentDrawer.nickname,
    word_length: game.currentWord.length,
    round_duration: ROUND_DURATION / 1000, // Envia em segundos
  });

  // Inicia o timer da rodada
  game.roundTimerId = setTimeout(() => {
    if (game.state === "IN_GAME") {
      broadcast({
        action: "chat_message",
        from: "Servidor",
        text: `O tempo acabou! A palavra era: ${game.currentWord}`,
        type: "system",
      });
      startNextRound();
    }
  }, ROUND_DURATION);
}

function stopGame(reason: string) {
  clearRoundTimer();
  game.state = "LOBBY";
  game.currentDrawer = null;
  game.currentWord = "";
  broadcast({ action: "game_stop", reason });
  logConnection(`Jogo parado: ${reason}`);
}

function handleGuess(player: Player, word: string) {
  if (game.state !== "IN_GAME" || player.id === game.currentDrawer?.id) {
    return;
  }

  if (word.trim().toLowerCase() === game.currentWord.toLowerCase()) {
    clearRoundTimer(); // Acertou, então para o timer
    player.score += 10;
    if (game.currentDrawer) {
      game.currentDrawer.score += 5;
    }
    game.state = "ROUND_OVER";

    broadcast({
      action: "correct_guess",
      from: "Servidor",
      text: `${player.nickname} acertou a palavra! A palavra era: ${game.currentWord}`,
      type: "correct",
      word: game.currentWord,
    });
    broadcastPlayerList();
    logConnection(`${player.nickname} acertou a palavra: ${game.currentWord}`);
    startNextRound();
  } else {
    broadcast({
      action: "chat_message",
      from: player.nickname,
      text: word,
      type: "guess",
    });
  }
}

// --- Gerenciamento de Conexões e Mensagens ---

function handleRegister(connection: ClientConnection, nickname: string) {
  if (!nickname) {
    sendMessage(connection, { error: "Apelido não pode ser vazio" });
    return;
  }

  const id =
    connection instanceof net.Socket
      ? `${connection.remoteAddress}:${connection.remotePort}`
      : Math.random().toString(36).substring(2, 15);

  const newPlayer: Player = {
    nickname,
    id,
    connection,
    score: 0,
  };

  players.push(newPlayer);

  logConnection(`Jogador registrado: ${nickname} (ID: ${id})`);
  logUserToCsv(newPlayer); // Add user to CSV registry

  sendMessage(connection, {
    status: "success",
    message: "Registrado com sucesso!",
  });

  broadcastPlayerList();
}

function handleDisconnect(connection: ClientConnection) {
  const playerIndex = players.findIndex((p) => p.connection === connection);

  if (playerIndex !== -1) {
    const disconnectedPlayer = players.splice(playerIndex, 1)[0];
    logConnection(`Jogador desconectado: ${disconnectedPlayer.nickname}`);

    if (
      game.state === "IN_GAME" &&
      game.currentDrawer?.id === disconnectedPlayer.id
    ) {
      stopGame("O desenhista saiu da partida.");
    }

    broadcastPlayerList();
  }
}

function handleMessage(connection: ClientConnection, data: Buffer | string) {
  try {
    const message = JSON.parse(data.toString());
    // if (message.action !== "draw") {
    //   console.log("Mensagem recebida:", message);
    // }

    if (message.action === "register") {
      handleRegister(connection, message.nickname);
      return;
    }

    const player = players.find((p) => p.connection === connection);
    if (!player) return;

    switch (message.action) {
      case "start_game":
        if (game.state === "LOBBY") {
          startGame();
        }
        break;
      case "draw":
        if (game.state === "IN_GAME" && player.id === game.currentDrawer?.id) {
          broadcastToOthers(connection, {
            action: "drawing_update",
            data: message.data,
          });
        }
        break;
      case "guess":
        handleGuess(player, message.word);
        break;
      default:
        // console.log(`Ação desconhecida: ${message.action}`);
        sendMessage(connection, { error: "Ação desconhecida" });
    }
  } catch (error) {
    console.error("Erro ao processar mensagem:", error);
    sendMessage(connection, { error: "Mensagem inválida" });
  }
}

// --- Servidores TCP e WebSocket ---

const tcpServer = net.createServer((socket) => {
  const clientInfo = `TCP client from ${socket.remoteAddress}:${socket.remotePort}`;
  logConnection(`Nova conexão: ${clientInfo}`);

  socket.on("data", (data) => handleMessage(socket, data));
  socket.on("close", () => {
    logConnection(`Conexão fechada: ${clientInfo}`);
    handleDisconnect(socket);
  });
  socket.on("error", (err) => {
    logConnection(`Erro na conexão ${clientInfo}: ${err.message}`);
    handleDisconnect(socket);
  });
});

tcpServer.listen(TCP_PORT, HOST, () => {
  logConnection(`Servidor TCP escutando em ${HOST}:${TCP_PORT}`);
});

const wsServer = new WebSocketServer({ port: WS_PORT, host: HOST });

wsServer.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const clientIp = req.socket.remoteAddress || "N/A";
  wsIpMap.set(ws, clientIp); // Store IP for later retrieval
  logConnection(`Nova conexão WebSocket de ${clientIp}`);

  ws.on("message", (data) => handleMessage(ws, data.toString()));
  ws.on("close", () => {
    logConnection(`Conexão WebSocket fechada de ${clientIp}`);
    wsIpMap.delete(ws); // Clean up map on disconnect
    handleDisconnect(ws);
  });
  ws.on("error", (err) => {
    logConnection(`Erro na conexão WebSocket de ${clientIp}: ${err.message}`);
    wsIpMap.delete(ws); // Clean up map on error
    handleDisconnect(ws);
  });
});

wsServer.on("listening", () => {
  logConnection(
    `Servidor WebSocket (clientes web) escutando em ${HOST}:${WS_PORT}`
  );
});
