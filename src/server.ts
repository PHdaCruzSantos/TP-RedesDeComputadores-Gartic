import * as net from "net";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import * as path from "path";
import { IncomingMessage } from "http";
import { logEvent } from "./connectionLogger";
import { logUserRegistration } from "./userRegistry";

// --- Tipos e Interfaces ---

type ClientConnection = net.Socket | WebSocket;

interface Player {
  nickname: string;
  id: string;
  connection: ClientConnection;
  score: number;
  wins: number;
  ipAddress?: string;
  port?: number;
}

type GameState = "LOBBY" | "IN_GAME" | "ROUND_OVER";

// --- Variáveis Globais ---

const players: Player[] = [];
const wsIpMap = new Map<WebSocket, string>();
const wsPortMap = new Map<WebSocket, number>();
const TCP_PORT = 2002; // ALterar para 2002 -> data de nascimento das crianças do grupo XDXD
const WS_PORT = 8080;
const HOST = "0.0.0.0"; // Escuta em todas as interfaces de rede disponíveis
const ROUND_DURATION = 60000; // 60 segundos

// Carrega a lista de palavras de um arquivo JSON
let wordList: string[] = [];
try {
  const wordsFilePath = path.join(__dirname, "words.json");
  const wordsFileContent = fs.readFileSync(wordsFilePath, "utf-8");
  wordList = JSON.parse(wordsFileContent);
  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "info",
    message: `${wordList.length} palavras carregadas do arquivo words.json.`,
  });
} catch (error) {
  console.error("Erro ao carregar a lista de palavras:", error);
  // Fallback para uma lista padrão caso o arquivo falhe
  wordList = [
    "Casa",
    "Carro",
    "Banana",
    "Computador",
    "Sol",
    "Livro",
    "Elefante",
    "Girafa",
  ];
  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "error",
    message: `Usando lista de palavras padrão devido a um erro.`,
  });
}

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
    wins: p.wins,
  }));
  broadcast({ action: "update_players", players: playerList });
}

// --- Lógica do Jogo ---

// Fila de jogadores para determinar a ordem de desenho
let playerQueue: Player[] = [];
let drawerIndex = -1; // Índice do desenhista atual na fila
let maxScore = 0; // Pontuação para vencer a partida

function clearRoundTimer() {
  if (game.roundTimerId) {
    clearTimeout(game.roundTimerId);
    game.roundTimerId = null;
  }
}

function endGame(winners: Player[]) {
  clearRoundTimer();

  // Cria um ranking final ordenado por pontuação
  const finalRanking = [...players]
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ nickname: p.nickname, score: p.score }));

  let title = "";
  let logMessage = "";

  if (winners.length === 1) {
    title = `Fim de Jogo! O campeão é ${winners[0].nickname}!`;
    logMessage = `Jogo finalizado. Vencedor: ${winners[0].nickname}.`;
  } else {
    const winnerNames = winners.map((w) => w.nickname).join(", ");
    title = `Fim de Jogo! Houve um empate entre ${winnerNames}!`;
    logMessage = `Jogo finalizado. Empate entre: ${winnerNames}.`;
  }

  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "game_event",
    message: logMessage,
  });

  // Contador de vitórias para os vencedores
  winners.forEach((winner) => {
    const playerInGame = players.find((p) => p.id === winner.id);
    if (playerInGame) {
      playerInGame.wins += 1;
    }
  });

  broadcast({
    action: "game_over",
    title: title,
    ranking: finalRanking,
  });

  // Envia o resultado também como uma mensagem no chat
  broadcast({
    action: "chat_message",
    from: "Servidor",
    text: logMessage,
    type: "system",
  });

  // Reseta o estado para o lobby, mantendo os jogadores e suas pontuações finais visíveis
  game.state = "LOBBY";
  game.currentDrawer = null;
  game.currentWord = "";
  playerQueue = [];
  drawerIndex = -1;
  maxScore = 0;
}

function checkForWinner(): boolean {
  if (players.length === 0 || maxScore === 0) return false;

  const highestScore = Math.max(...players.map((p) => p.score));

  if (highestScore >= maxScore) {
    const winners = players.filter((p) => p.score === highestScore);
    if (winners.length > 0) {
      endGame(winners);
      return true;
    }
  }
  return false;
}

function startNewRound() {
  clearRoundTimer();

  // Verifica se há um vencedor antes de iniciar uma nova rodada
  if (checkForWinner()) return;

  if (playerQueue.length < 2) {
    stopGame("Jogadores insuficientes para continuar.");
    return;
  }

  broadcast({ action: "game_stop", reason: "" });

  broadcast({
    action: "chat_message",
    from: "Servidor",
    text: `Próxima rodada em 5 segundos...`,
    type: "system",
  });

  // Inicia a próxima rodada após um intervalo
  setTimeout(() => {
    if (playerQueue.length < 2) {
      stopGame("Jogadores insuficientes para continuar.");
      return;
    }

    // Avança para o próximo desenhista na fila
    drawerIndex = (drawerIndex + 1) % playerQueue.length;
    game.currentDrawer = playerQueue[drawerIndex];

    const wordIndex = Math.floor(Math.random() * wordList.length);
    game.currentWord = wordList[wordIndex];
    game.state = "IN_GAME";

    logEvent({
      timestamp: new Date().toISOString(),
      eventType: "game_event",
      message: `Nova rodada! Desenhista: ${game.currentDrawer.nickname}, Palavra: ${game.currentWord}`,
      nickname: game.currentDrawer.nickname,
    });

    // Informa ao desenhista qual é a sua palavra
    sendMessage(game.currentDrawer.connection, {
      action: "your_turn",
      word: game.currentWord,
    });

    // Informa a todos os outros sobre o início da rodada
    broadcast({
      action: "game_start",
      drawer: game.currentDrawer.nickname,
      word_length: game.currentWord.length,
      round_duration: ROUND_DURATION / 1000,
      maxScore: maxScore,
    });

    // Inicia o timer da rodada no servidor
    game.roundTimerId = setTimeout(() => {
      if (game.state === "IN_GAME") {
        broadcast({
          action: "chat_message",
          from: "Servidor",
          text: `O tempo acabou! A palavra era: ${game.currentWord}`,
          type: "system",
        });
        startNewRound(); // Passa para a próxima rodada
      }
    }, ROUND_DURATION);
  }, 5000);
}

function startGame() {
  if (players.length < 2) {
    broadcast({
      action: "game_error",
      message: "São necessários pelo menos 2 jogadores para começar.",
    });
    return;
  }

  players.forEach((p) => (p.score = 0));

  //pontuação máxima 15 pontos por jogador na partida
  maxScore = players.length * 15;

  playerQueue = [...players];
  for (let i = playerQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerQueue[i], playerQueue[j]] = [playerQueue[j], playerQueue[i]];
  }
  drawerIndex = -1;

  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "game_event",
    message: `Jogo iniciado com ${players.length} jogadores. Meta de ${maxScore} pontos.`,
  });

  broadcast({
    action: "chat_message",
    from: "Servidor",
    text: `O jogo começou! O primeiro a fazer ${maxScore} pontos vence!`,
    type: "system",
  });

  broadcastPlayerList(); // Envia a lista com as pontuações zeradas
  startNewRound(); // Inicia a primeira rodada
}

function stopGame(reason: string) {
  clearRoundTimer();
  game.state = "LOBBY";
  game.currentDrawer = null;
  game.currentWord = "";
  playerQueue = [];
  drawerIndex = -1;
  maxScore = 0;
  broadcast({ action: "game_stop", reason });
  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "game_event",
    message: `Jogo parado: ${reason}`,
  });
}

function handleGuess(player: Player, word: string) {
  if (game.state !== "IN_GAME" || player.id === game.currentDrawer?.id) {
    return;
  }

  if (word.trim().toLowerCase() === game.currentWord.toLowerCase()) {
    clearRoundTimer(); // Para o timer da rodada
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
    broadcastPlayerList(); // Atualiza as pontuações para todos
    logEvent({
      timestamp: new Date().toISOString(),
      eventType: "game_event",
      message: `${player.nickname} acertou a palavra: ${game.currentWord}`,
      nickname: player.nickname,
      playerId: player.id,
    });

    // Verifica se o jogo acabou, senão, inicia a próxima rodada
    if (!checkForWinner()) {
      startNewRound();
    }
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

function handleRegister(
  connection: ClientConnection,
  nickname: string,
  ipAddress?: string,
  port?: number
) {
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
    wins: 0,
    ipAddress,
    port,
  };

  players.push(newPlayer);
  // Adiciona o novo jogador à fila de espera se o jogo já começou
  if (game.state !== "LOBBY") {
    playerQueue.push(newPlayer);
    sendMessage(connection, {
      action: "chat_message",
      from: "Servidor",
      text: "O jogo já começou. Você foi adicionado à fila e desenhará em breve.",
      type: "system",
    });
  }

  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "connection",
    message: `Jogador registrado: ${nickname}`,
    nickname: newPlayer.nickname,
    playerId: newPlayer.id,
    ipAddress: newPlayer.ipAddress,
    connectionType:
      newPlayer.connection instanceof net.Socket ? "TCP" : "WebSocket",
  });

  // Log to CSV
  logUserRegistration({
    nickname: newPlayer.nickname,
    userId: newPlayer.id,
    connectionType:
      newPlayer.connection instanceof net.Socket ? "TCP" : "WebSocket",
    ipAddress: newPlayer.ipAddress,
    port: newPlayer.port,
  });

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
    // Remove também da fila de desenho
    const queueIndex = playerQueue.findIndex(
      (p) => p.id === disconnectedPlayer.id
    );
    if (queueIndex !== -1) {
      playerQueue.splice(queueIndex, 1);
    }

    if (disconnectedPlayer.connection instanceof WebSocket) {
      wsIpMap.delete(disconnectedPlayer.connection);
      wsPortMap.delete(disconnectedPlayer.connection);
    }

    logEvent({
      timestamp: new Date().toISOString(),
      eventType: "disconnection",
      message: `Jogador desconectado: ${disconnectedPlayer.nickname}`,
      nickname: disconnectedPlayer.nickname,
      playerId: disconnectedPlayer.id,
      ipAddress: disconnectedPlayer.ipAddress,
      connectionType:
        disconnectedPlayer.connection instanceof net.Socket
          ? "TCP"
          : "WebSocket",
    });

    if (
      game.state === "IN_GAME" &&
      game.currentDrawer?.id === disconnectedPlayer.id
    ) {
      broadcast({
        action: "chat_message",
        from: "Servidor",
        text: "O desenhista saiu. A rodada foi interrompida.",
        type: "system",
      });
      startNewRound(); // Pula para a próxima rodada
    } else if (players.length < 2 && game.state === "IN_GAME") {
      stopGame("Jogadores insuficientes para continuar.");
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
      const ip =
        connection instanceof net.Socket
          ? connection.remoteAddress
          : wsIpMap.get(connection as WebSocket);
      const port =
        connection instanceof net.Socket
          ? connection.remotePort
          : wsPortMap.get(connection as WebSocket);
      handleRegister(connection, message.nickname, ip, port);
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
      case "request_restart":
        if (game.state === "LOBBY") {
          logEvent({
            timestamp: new Date().toISOString(),
            eventType: "game_event",
            message: `Jogador ${player.nickname} requisitou um novo jogo.`,
            nickname: player.nickname,
            playerId: player.id,
          });
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
  const ip = socket.remoteAddress;
  const port = socket.remotePort;
  const clientInfo = `TCP client from ${ip}:${port}`;

  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "connection",
    message: `Nova conexão TCP: ${clientInfo}`,
    ipAddress: ip,
    connectionType: "TCP",
  });

  socket.on("data", (data) => handleMessage(socket, data));
  socket.on("close", () => {
    handleDisconnect(socket);
  });
  socket.on("error", (err) => {
    logEvent({
      timestamp: new Date().toISOString(),
      eventType: "error",
      message: `Erro na conexão TCP ${clientInfo}: ${err.message}`,
      ipAddress: ip,
      connectionType: "TCP",
    });
    handleDisconnect(socket);
  });
});

tcpServer.listen(TCP_PORT, HOST, () => {
  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "info",
    message: `Servidor TCP escutando em ${HOST}:${TCP_PORT}`,
  });
});

const wsServer = new WebSocketServer({ port: WS_PORT, host: HOST });

wsServer.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  // Tenta obter o IP real do cabeçalho X-Forwarded-For (usado por proxies como o Ngrok)
  // O cabeçalho pode conter uma lista de IPs, o primeiro é o do cliente original.
  const forwardedFor = req.headers["x-forwarded-for"];
  const clientIp =
    (typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0].trim()
      : undefined) ||
    req.socket.remoteAddress ||
    "N/A";
  const clientPort = req.socket.remotePort;

  wsIpMap.set(ws, clientIp);
  if (clientPort) {
    wsPortMap.set(ws, clientPort);
  }

  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "connection",
    message: `Nova conexão WebSocket de ${clientIp}:${clientPort || "?"}`,
    ipAddress: clientIp,
    connectionType: "WebSocket",
  });

  ws.on("message", (data) => handleMessage(ws, data.toString()));
  ws.on("close", () => {
    wsIpMap.delete(ws);
    wsPortMap.delete(ws);
    handleDisconnect(ws);
  });
  ws.on("error", (err) => {
    logEvent({
      timestamp: new Date().toISOString(),
      eventType: "error",
      message: `Erro na conexão WebSocket de ${clientIp}: ${err.message}`,
      ipAddress: clientIp,
      connectionType: "WebSocket",
    });
    wsIpMap.delete(ws);
    wsPortMap.delete(ws);
    handleDisconnect(ws);
  });
});

wsServer.on("listening", () => {
  logEvent({
    timestamp: new Date().toISOString(),
    eventType: "info",
    message: `Servidor WebSocket (clientes web) escutando em ${HOST}:${WS_PORT}`,
  });
});
