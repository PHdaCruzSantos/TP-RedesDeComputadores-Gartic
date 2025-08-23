"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const net = __importStar(require("net"));
const ws_1 = require("ws");
// --- Variáveis Globais ---
const players = [];
const TCP_PORT = 2004;
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
let game = {
    state: "LOBBY",
    currentDrawer: null,
    currentWord: "",
    roundTimerId: null,
};
// --- Lógica de Comunicação ---
function sendMessage(connection, message) {
    const serializedMessage = JSON.stringify(message);
    if (connection instanceof net.Socket) {
        connection.write(serializedMessage);
    }
    else if (connection instanceof ws_1.WebSocket) {
        connection.send(serializedMessage);
    }
}
function broadcast(message) {
    for (const player of players) {
        sendMessage(player.connection, message);
    }
}
function broadcastToOthers(origin, message) {
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
        }
        else {
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
    console.log(`Nova rodada! Desenhista: ${game.currentDrawer.nickname}, Palavra: ${game.currentWord}`);
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
function stopGame(reason) {
    clearRoundTimer();
    game.state = "LOBBY";
    game.currentDrawer = null;
    game.currentWord = "";
    broadcast({ action: "game_stop", reason });
    console.log(`Jogo parado: ${reason}`);
}
function handleGuess(player, word) {
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
        console.log(`${player.nickname} acertou a palavra: ${game.currentWord}`);
        startNextRound();
    }
    else {
        broadcast({
            action: "chat_message",
            from: player.nickname,
            text: word,
            type: "guess",
        });
    }
}
// --- Gerenciamento de Conexões e Mensagens ---
function handleRegister(connection, nickname) {
    if (!nickname) {
        sendMessage(connection, { error: "Apelido não pode ser vazio" });
        return;
    }
    const id = connection instanceof net.Socket
        ? `${connection.remoteAddress}:${connection.remotePort}`
        : Math.random().toString(36).substring(2, 15);
    const newPlayer = {
        nickname,
        id,
        connection,
        score: 0,
    };
    players.push(newPlayer);
    console.log(`Jogador registrado: ${nickname} (ID: ${id})`, connection);
    sendMessage(connection, {
        status: "success",
        message: "Registrado com sucesso!",
    });
    broadcastPlayerList();
}
function handleDisconnect(connection) {
    const playerIndex = players.findIndex((p) => p.connection === connection);
    if (playerIndex !== -1) {
        const disconnectedPlayer = players.splice(playerIndex, 1)[0];
        console.log(`Jogador desconectado: ${disconnectedPlayer.nickname}`);
        if (game.state === "IN_GAME" &&
            game.currentDrawer?.id === disconnectedPlayer.id) {
            stopGame("O desenhista saiu da partida.");
        }
        broadcastPlayerList();
    }
}
function handleMessage(connection, data) {
    try {
        const message = JSON.parse(data.toString());
        if (message.action !== "draw") {
            console.log("Mensagem recebida:", message);
        }
        if (message.action === "register") {
            handleRegister(connection, message.nickname);
            return;
        }
        const player = players.find((p) => p.connection === connection);
        if (!player)
            return;
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
                console.log(`Ação desconhecida: ${message.action}`);
                sendMessage(connection, { error: "Ação desconhecida" });
        }
    }
    catch (error) {
        console.error("Erro ao processar mensagem:", error);
        sendMessage(connection, { error: "Mensagem inválida" });
    }
}
// --- Servidores TCP e WebSocket ---
const tcpServer = net.createServer((socket) => {
    console.log(`Novo cliente TCP conectado: ${socket.remoteAddress}:${socket.remotePort}`);
    socket.on("data", (data) => handleMessage(socket, data));
    socket.on("close", () => handleDisconnect(socket));
    socket.on("error", (err) => {
        console.error(`Erro no socket TCP: ${err.message}`);
        handleDisconnect(socket);
    });
});
tcpServer.listen(TCP_PORT, HOST, () => {
    console.log(`Servidor TCP (gerenciamento) escutando em ${HOST}:${TCP_PORT}`);
});
const wsServer = new ws_1.WebSocketServer({ port: WS_PORT, host: HOST });
wsServer.on("connection", (ws) => {
    console.log("Novo cliente WebSocket conectado.");
    ws.on("message", (data) => handleMessage(ws, data.toString()));
    ws.on("close", () => handleDisconnect(ws));
    ws.on("error", (err) => {
        console.error(`Erro no WebSocket: ${err.message}`);
        handleDisconnect(ws);
    });
});
wsServer.on("listening", () => {
    console.log(`Servidor WebSocket (clientes web) escutando em ${HOST}:${WS_PORT}`);
});
