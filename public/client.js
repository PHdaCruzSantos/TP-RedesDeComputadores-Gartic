// --- Elementos da UI ---
var loginContainer = document.getElementById("login-container");
var gameContainer = document.getElementById("game-container");
var nicknameInput = document.getElementById("nickname-input");
var connectBtn = document.getElementById("connect-btn");
// Elementos do Jogo
var playerList = document.getElementById("player-list");
var canvas = document.getElementById("drawing-canvas");
var ctx = canvas.getContext("2d");
var startGameBtn = document.getElementById("start-game-btn");
var wordDisplay = document.getElementById("word-display");
var secretWordSpan = document.getElementById("secret-word");
var gameInfo = document.getElementById("game-info");
var chatMessages = document.getElementById("chat-messages");
var guessInput = document.getElementById("guess-input");
var guessBtn = document.getElementById("guess-btn");
var timerSpan = document.getElementById("timer");
// --- Conexão WebSocket e Estado do Cliente---
var ws;
var myNickname = "";
var isMyTurn = false;
var isDrawing = false;
var lastX = 0;
var lastY = 0;
var clientTimerId = null;
// --- Funções de UI ---
function updatePlayerList(players) {
    playerList.innerHTML = ""; // Limpa a lista atual
    players.forEach(function (player) {
        var li = document.createElement("li");
        li.textContent = "".concat(player.nickname, " - ").concat(player.score, " pontos");
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
function handleGameStart(message) {
    clearClientTimer();
    wordDisplay.classList.remove("hidden");
    startGameBtn.classList.add("hidden");
    isMyTurn = message.drawer === myNickname;
    guessInput.disabled = isMyTurn;
    var infoText = document.createElement("p");
    infoText.id = "info-text";
    infoText.textContent = "".concat(message.drawer, " est\u00E1 desenhando...");
    gameInfo.prepend(infoText);
    if (!isMyTurn) {
        secretWordSpan.textContent = "_ ".repeat(message.word_length);
    }
    // Inicia o contador visual
    var timeLeft = message.round_duration;
    timerSpan.textContent = timeLeft.toString();
    clientTimerId = setInterval(function () {
        timeLeft--;
        timerSpan.textContent = timeLeft.toString();
        if (timeLeft <= 0) {
            clearClientTimer();
        }
    }, 1000);
}

function handleYourTurn(message) {
    secretWordSpan.textContent = message.word;
    isMyTurn = true;
    guessInput.disabled = true;
    alert("Sua vez de desenhar! A palavra \u00E9: ".concat(message.word));
}

function resetGameView(reason) {
    clearClientTimer();
    wordDisplay.classList.add("hidden");
    startGameBtn.classList.remove("hidden");
    isMyTurn = false;
    guessInput.disabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Limpa o canvas
    var infoText = document.getElementById("info-text");
    if (infoText) {
        infoText.remove();
    }
    secretWordSpan.textContent = "";
    timerSpan.textContent = "-";
    if (reason) {
        alert("Jogo terminado: ".concat(reason));
    }
}
function appendChatMessage(message) {
    var msgElement = document.createElement("p");
    msgElement.classList.add(message.type); // Adiciona classe para estilização
    msgElement.innerHTML = "<strong>".concat(message.from, ":</strong> ").concat(message.text);
    chatMessages.appendChild(msgElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll
}
// --- Funções de Desenho ---
function startDrawing(e) {
    var _a;
    if (!isMyTurn)
        return;
    isDrawing = true;
    _a = [e.offsetX, e.offsetY], lastX = _a[0], lastY = _a[1];
}
function stopDrawing() {
    isDrawing = false;
}
function draw(e) {
    var _a;
    if (!isDrawing || !isMyTurn)
        return;
    var newX = e.offsetX;
    var newY = e.offsetY;
    var drawData = {
        from: { x: lastX, y: lastY },
        to: { x: newX, y: newY }
    };
    // Desenha localmente e envia para o servidor
    drawRemotely(drawData);
    ws.send(JSON.stringify({ action: "draw", data: drawData }));
    _a = [newX, newY], lastX = _a[0], lastY = _a[1];
}
function drawRemotely(data) {
    ctx.beginPath();
    ctx.moveTo(data.from.x, data.from.y);
    ctx.lineTo(data.to.x, data.to.y);
    ctx.strokeStyle = "#000"; // Cor do traço
    ctx.lineWidth = 5; // Espessura do traço
    ctx.stroke();
}
// --- Lógica de Conexão e Jogo ---
function handleGuessSubmit() {
    var word = guessInput.value.trim();
    if (word) {
        ws.send(JSON.stringify({ action: "guess", word: word }));
        guessInput.value = "";
    }
}
connectBtn.addEventListener("click", function () {
    var nickname = nicknameInput.value;
    if (!nickname) {
        alert("Por favor, insira um apelido.");
        return;
    }
    myNickname = nickname;
    ws = new WebSocket('ws://127.0.0.1:8080');
    ws.onopen = function () {
        console.log("Conectado ao servidor WebSocket!");
        ws.send(JSON.stringify({ action: "register", nickname: myNickname }));
    };
    ws.onmessage = function (event) {
        var message = JSON.parse(event.data);
        if (message.action !== 'drawing_update') {
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
            case "game_error":
                alert("Erro no jogo: ".concat(message.message));
                break;
        }
        if (message.status === "success") {
            showGameView();
        }
        if (message.error) {
            alert("Erro do servidor: ".concat(message.error));
        }
    };
    ws.onclose = function () {
        console.log("Desconectado do servidor.");
        showLoginView();
    };
    ws.onerror = function (error) {
        console.error("Erro no WebSocket:", error);
        alert("Não foi possível conectar ao servidor.");
    };
});
startGameBtn.addEventListener("click", function () {
    ws.send(JSON.stringify({ action: "start_game" }));
});
guessBtn.addEventListener("click", handleGuessSubmit);
guessInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        handleGuessSubmit();
    }
});
// Adiciona os listeners para o desenho
canvas.addEventListener("mousedown", startDrawing);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("mouseout", stopDrawing);
