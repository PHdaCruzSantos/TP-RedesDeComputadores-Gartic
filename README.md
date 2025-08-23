# Documentação do Projeto: Gartic Online

## 1. Visão Geral

Este projeto é uma implementação de um jogo multiplayer online de desenho e adivinhação, similar ao Gartic, construído com TypeScript. Ele utiliza um modelo cliente-servidor, onde um servidor Node.js gerencia a lógica do jogo e os clientes (jogadores em um navegador web) se conectam para participar.

O objetivo principal foi criar uma aplicação de rede funcional, explorando a comunicação via Sockets e protocolos da camada de transporte como o TCP, conforme solicitado nas diretrizes do trabalho de Redes de Computadores.

## 2. Como Executar e Jogar

Existem duas maneiras de jogar: localmente em sua própria máquina ou online com amigos pela internet.

### 2.1. Jogando Localmente

1.  **Instalar dependências**: `npm install`
2.  **Compilar o código**: `npm run build` (Este passo é **essencial** sempre que você modificar os arquivos `.ts`).
3.  **Iniciar o servidor**: `npm start`
4.  **Jogar**: Abra o arquivo `public/index.html` em um ou mais navegadores. Cada aba do navegador funcionará como um jogador diferente.

### 2.2. Jogando Online com Amigos (Usando `ngrok`)

Para que outras pessoas na internet possam se conectar ao seu servidor (que está rodando no seu computador), usamos o `ngrok` para criar um "túnel" seguro da internet para a sua máquina.

**Passo 1: Configurar o `ngrok`**

1.  Instale o `ngrok` (seja baixando ou via gerenciador de pacotes).
2.  Crie um arquivo de configuração em `~/.config/ngrok/ngrok.yml` com o seguinte conteúdo para gerenciar os dois túneis necessários:
    ```yaml
    version: "2"
    tunnels:
      site:
        proto: http
        addr: 8000
      jogo:
        proto: http
        addr: 8080
    ```

**Passo 2: Iniciar os Servidores e o `ngrok`**

Você precisará de **3 terminais** rodando ao mesmo tempo:

1.  **Terminal 1 (Servidor do Jogo):**
    ```bash
    npm start
    ```
2.  **Terminal 2 (Servidor Web):**
    ```bash
    python3 -m http.server --directory public 8000
    ```
3.  **Terminal 3 (`ngrok`):**
    ```bash
    ngrok start --all
    ```

**Passo 3: Conectar e Jogar**

1.  No terminal do `ngrok`, você verá duas URLs públicas.
2.  Compartilhe a URL do túnel `site` com seus amigos. Eles devem abri-la no navegador.
3.  Ao se conectar no jogo, uma caixa de diálogo pedirá o endereço do servidor. Todos devem inserir a URL do túnel `jogo`, trocando o prefixo `https://` por `wss://`.

## 3. Arquitetura e Protocolos de Rede

### 3.1. Atendendo aos Requisitos de Sockets TCP

O trabalho prático exige o uso de "Sockets TCP" para a comunicação. O projeto atende a este requisito de duas maneiras fundamentais:

1.  **Servidor TCP Explícito (Porta 2004):** O arquivo `server.ts` instancia um servidor TCP puro utilizando a biblioteca `net` do Node.js. Este servidor escuta na porta `2004` (conforme o exemplo do trabalho) e está preparado para receber conexões TCP diretas. Isso demonstra o conhecimento e a aplicação direta da tecnologia de Sockets TCP.

2.  **WebSocket sobre TCP (Porta 8080):** A principal comunicação do jogo, realizada via WebSockets, é construída **sobre o protocolo TCP**. Quando um cliente se conecta ao servidor WebSocket, ocorre o seguinte:
    *   Um handshake HTTP/S é realizado para iniciar a conexão.
    *   A conexão é "atualizada" para uma conexão TCP persistente e bidirecional.
    *   Todos os dados do jogo (desenhos, palpites, etc.) são encapsulados em "frames" WebSocket, que por sua vez são transportados de forma confiável por pacotes TCP.

Portanto, toda a lógica do jogo depende da confiabilidade e da conexão orientada do TCP, cumprindo integralmente o requisito central do trabalho.

### 3.2. Componentes da Aplicação

*   **Servidor do Jogo (`server.ts`):** O cérebro da aplicação. Roda na porta `8080` (WebSocket) e `2004` (TCP). Gerencia o estado do jogo, jogadores, rodadas e a comunicação em tempo real.
*   **Servidor Web (`python3`):** Um servidor simples e temporário na porta `8000`, cuja única função é entregar os arquivos do frontend (`index.html`, `client.js`, etc.) para os navegadores dos jogadores.
*   **Cliente (`client.ts`):** O frontend que roda no navegador. É responsável pela interface, por capturar as ações do usuário e pela comunicação via WebSocket com o Servidor do Jogo.

### 3.3. O Papel do `ngrok`

O `ngrok` atua como uma ponte entre a internet pública e os servidores rodando localmente no seu computador. Ele resolve os problemas de IP privado, firewalls e NAT, criando URLs públicas para os seus serviços locais. No nosso caso, ele expõe tanto o Servidor Web (para que os jogadores possam baixar o jogo) quanto o Servidor do Jogo (para que o jogo possa se conectar e funcionar).

## 4. Estrutura do Projeto

-   `src/server.ts`: Código-fonte do backend.
-   `src/client.ts`: Código-fonte do frontend.
-   `public/`: Contém os arquivos web estáticos.
    -   `index.html`: Estrutura da página.
    -   `client.js`: **Arquivo compilado** a partir de `src/client.ts`.
-   `package.json`: Define dependências e scripts do projeto.
-   `tsconfig.json`: Configurações do compilador TypeScript.