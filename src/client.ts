// --- Elementos da UI ---
const loginContainer = document.getElementById("login-container")!;
const gameContainer = document.getElementById("game-container")!;
const nicknameInput = document.getElementById(
  "nickname-input"
) as HTMLInputElement;
const connectBtn = document.getElementById("connect-btn")!;

// Elementos do Jogo
const playerList = document.getElementById("player-list")!;
const canvas = document.getElementById("drawing-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const startGameBtn = document.getElementById("start-game-btn")!;
const wordDisplay = document.getElementById("word-display")!;
const secretWordSpan = document.getElementById("secret-word")!;
const gameInfo = document.getElementById("game-info")!;
const chatMessages = document.getElementById("chat-messages")!;
const guessInput = document.getElementById("guess-input") as HTMLInputElement;
const guessBtn = document.getElementById("guess-btn")!;
const timerSpan = document.getElementById("timer")!;
const goalScoreSpan = document.getElementById("goal-score")!;

// Elementos do Modal de Fim de Jogo
const gameOverContainer = document.getElementById("game-over-container")!;
const winnerAnnouncement = document.getElementById("winner-announcement")!;
const finalRankingList = document.getElementById("final-ranking-list")!;
const playAgainBtn = document.getElementById("play-again-btn")!;

// --- Conexão WebSocket e Estado do Cliente---
let ws: WebSocket;
let myNickname: string = "";
let isMyTurn = false;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let clientTimerId: any = null;

// --- Funções de UI ---

function updatePlayerList(
  players: { nickname: string; score: number; wins: number }[]
) {
  playerList.innerHTML = ""; // Limpa a lista atual
  players.sort((a, b) => b.score - a.score); // Ordena por pontuação

  players.forEach((player) => {
    const li = document.createElement("li");
    const trophy = player.wins > 0 ? `🏆(${player.wins})` : ""; // Adiciona troféu e contagem de vitórias
    li.textContent = `${trophy} ${player.nickname} - ${player.score} pontos`;
    playerList.appendChild(li);
  });
}

function showGameView() {
  loginContainer.classList.add("hidden");
  gameContainer.classList.remove("hidden");
}

function showLoginView() {
  loginContainer.classList.remove("hidden");
  gameContainer.classList.add("hidden");
  alert("Você foi desconectado.");
}

function clearClientTimer() {
  if (clientTimerId) {
    clearInterval(clientTimerId);
    clientTimerId = null;
  }
}

function handleGameStart(message: {
  drawer: string;
  word_length: number;
  round_duration: number;
  maxScore: number;
}) {
  clearClientTimer();
  wordDisplay.classList.remove("hidden");
  startGameBtn.classList.add("hidden");
  isMyTurn = message.drawer === myNickname;
  guessInput.disabled = isMyTurn;
  goalScoreSpan.textContent = message.maxScore.toString();

  // Remove o texto antigo se existir
  const oldInfoText = document.getElementById("info-text");
  if (oldInfoText) {
    oldInfoText.remove();
  }

  const infoText = document.createElement("p");
  infoText.id = "info-text";
  infoText.textContent = `${message.drawer} está desenhando...`;
  gameInfo.prepend(infoText);

  if (!isMyTurn) {
    secretWordSpan.textContent = "_ ".repeat(message.word_length);
  }

  // Inicia o contador visual
  let timeLeft = message.round_duration;
  timerSpan.textContent = timeLeft.toString();
  clientTimerId = setInterval(() => {
    timeLeft--;
    timerSpan.textContent = timeLeft.toString();
    if (timeLeft <= 0) {
      clearClientTimer();
    }
  }, 1000);
}

function handleYourTurn(message: { word: string }) {
  secretWordSpan.textContent = message.word;
  isMyTurn = true;
  guessInput.disabled = true;
  alert(`Sua vez de desenhar! A palavra é: ${message.word}`);
}

function resetGameView(reason: string) {
  clearClientTimer();
  wordDisplay.classList.add("hidden");
  startGameBtn.classList.remove("hidden");
  isMyTurn = false;
  guessInput.disabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Limpa o canvas

  const infoText = document.getElementById("info-text");
  if (infoText) {
    infoText.remove();
  }
  secretWordSpan.textContent = "";
  timerSpan.textContent = "-";
  goalScoreSpan.textContent = "-";
  if (reason) {
    // Não mostra alerta para reset de rodada normal
    if (reason !== "") alert(`Jogo terminado: ${reason}`);
  }
}

// --- Funções de Desenho ---

function startDrawing(e: MouseEvent) {
  if (!isMyTurn) return;
  isDrawing = true;
  [lastX, lastY] = [e.offsetX, e.offsetY];
}

function stopDrawing() {
  isDrawing = false;
}

function draw(e: MouseEvent) {
  if (!isDrawing || !isMyTurn) return;

  const newX = e.offsetX;
  const newY = e.offsetY;
  const drawData = {
    from: { x: lastX, y: lastY },
    to: { x: newX, y: newY },
  };

  // Desenha localmente e envia para o servidor
  drawRemotely(drawData);
  ws.send(JSON.stringify({ action: "draw", data: drawData }));

  [lastX, lastY] = [newX, newY];
}

function drawRemotely(data: {
  from: { x: number; y: number };
  to: { x: number; y: number };
}) {
  ctx.beginPath();
  ctx.moveTo(data.from.x, data.from.y);
  ctx.lineTo(data.to.x, data.to.y);
  ctx.strokeStyle = "#000"; // Cor do traço
  ctx.lineWidth = 5; // Espessura do traço
  ctx.stroke();
}

// --- Lógica de Conexão e Jogo ---

function handleGuessSubmit() {
  const word = guessInput.value.trim();
  if (word) {
    ws.send(JSON.stringify({ action: "guess", word: word }));
    guessInput.value = "";
  }
}

connectBtn.addEventListener("click", () => {
  const nickname = nicknameInput.value;
  if (!nickname) {
    alert("Por favor, insira um apelido.");
    return;
  }

  const wsUrl = prompt(
    "Por favor, insira o endereço do servidor WebSocket (wss://...)",
    ""
  );
  if (!wsUrl || !wsUrl.startsWith("wss://")) {
    alert("Endereço de WebSocket inválido. Deve começar com wss://");
    return;
  }

  myNickname = nickname;

  // Conecta ao endereço fornecido pelo usuário
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("Conectado ao servidor WebSocket!");
    ws.send(JSON.stringify({ action: "register", nickname: myNickname }));
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.action !== "drawing_update") {
      console.log("Mensagem recebida:", message);
    }

    switch (message.action) {
      case "update_players":
        updatePlayerList(message.players);
        break;
      case "game_start":
        handleGameStart(message);
        break;
      case "your_turn":
        handleYourTurn(message);
        break;
      case "drawing_update":
        if (!isMyTurn) {
          drawRemotely(message.data);
        }
        break;
      case "chat_message":
        appendChatMessage(message);
        break;
      case "correct_guess":
        clearClientTimer();
        appendChatMessage(message);
        secretWordSpan.textContent = message.word; // Revela a palavra
        break;
      case "game_stop":
        resetGameView(message.reason);
        break;
      case "game_over":
        resetGameView(""); // Reseta a UI do jogo em segundo plano
        winnerAnnouncement.textContent = message.title;
        finalRankingList.innerHTML = ""; // Limpa o ranking anterior
        message.ranking.forEach(
          (player: { nickname: string; score: number }) => {
            const li = document.createElement("li");
            li.textContent = `${player.nickname} - ${player.score} pontos`;
            finalRankingList.appendChild(li);
          }
        );
        gameOverContainer.classList.remove("hidden");
        alert(message.title); // Adiciona o alert com o resultado
        break;
      case "game_error":
        alert(`Erro no jogo: ${message.message}`);
        break;
    }

    if (message.status === "success") {
      showGameView();
    }

    if (message.error) {
      alert(`Erro do servidor: ${message.error}`);
    }
  };

  ws.onclose = () => {
    console.log("Desconectado do servidor.");
    showLoginView();
  };

  ws.onerror = (error) => {
    console.error("Erro no WebSocket:", error);
    alert("Não foi possível conectar ao servidor.");
  };
});

startGameBtn.addEventListener("click", () => {
  ws.send(JSON.stringify({ action: "start_game" }));
});

guessBtn.addEventListener("click", handleGuessSubmit);
guessInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    handleGuessSubmit();
  }
});

playAgainBtn.addEventListener("click", () => {
  gameOverContainer.classList.add("hidden");
  ws.send(JSON.stringify({ action: "request_restart" }));
});

function appendChatMessage(message: { from: string, text: string, type: "guess" | "system" | "correct"}) {
    const msgElement = document.createElement("p");
    msgElement.classList.add(message.type); // Adiciona classe para estilização
    msgElement.innerHTML = `<strong>${message.from}:</strong> ${message.text}`;
    chatMessages.appendChild(msgElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll
}

// Adiciona os listeners para o desenho
