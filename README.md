# Documentação do Projeto Gartic

## 1. Visão Geral

Este projeto é uma implementação de um jogo de desenho e adivinhação em tempo real, similar ao Gartic, construído com TypeScript. Ele utiliza um modelo cliente-servidor, onde um servidor Node.js gerencia a lógica do jogo e os clientes (jogadores em um navegador web) se conectam para participar.

A comunicação em tempo real, essencial para a jogabilidade, é realizada principalmente através de WebSockets, com uma infraestrutura de servidor TCP também presente.

## 2. Arquitetura e Protocolos de Rede

A comunicação é a espinha dorsal deste projeto. Entender como os diferentes componentes de rede funcionam é crucial.

### 2.1. TCP (Transmission Control Protocol)

O TCP é um dos principais protocolos da Internet. Suas características são:

-   **Orientado à Conexão**: Antes de qualquer troca de dados, uma conexão estável (um "handshake") é estabelecida entre o cliente e o servidor.
-   **Confiável**: Garante que todos os pacotes de dados sejam entregues na ordem correta e sem erros. Se um pacote se perde, o TCP o reenvia.

**No seu projeto:**

1.  **Servidor TCP (Porta 2004)**: O arquivo `server.ts` cria um servidor TCP bruto usando a biblioteca `net` do Node.js. No código, ele é descrito como um servidor de "gerenciamento". Isso significa que ele poderia ser usado para conectar outros tipos de clientes (que não sejam navegadores) ou para tarefas administrativas. Atualmente, ele compartilha a mesma lógica de manipulação de mensagens que o servidor WebSocket.
2.  **Base para WebSockets**: Mais importante ainda, **o TCP é o protocolo que dá base ao WebSocket**. Toda a comunicação WebSocket que acontece no jogo é, fundamentalmente, transportada dentro de pacotes TCP, garantindo a entrega confiável das mensagens do jogo.

### 2.2. WebSocket (Porta 8080)

O WebSocket é um protocolo de comunicação construído sobre o TCP. Ele foi projetado especificamente para a web.

-   **Conexão Persistente e Full-Duplex**: Diferente do ciclo de requisição-resposta do HTTP tradicional, o WebSocket mantém uma única conexão aberta entre o cliente e o servidor. Ambos podem enviar dados um ao outro a qualquer momento, de forma independente.
-   **Baixa Latência**: Como a conexão já está estabelecida, a troca de mensagens é extremamente rápida, o que é vital para jogos em tempo real onde cada milissegundo conta.

**No seu projeto:**

-   O WebSocket é o **principal meio de comunicação para os jogadores no navegador**. O servidor (`ws` no Node.js) na porta 8080 lida com todas as ações do jogo:
    -   Registro de novos jogadores.
    -   Atualização da lista de jogadores no lobby.
    -   Envio de coordenadas de desenho do desenhista para outros jogadores.
    -   Recebimento de palpites dos jogadores.
    -   Sincronização do estado do jogo (início/fim de rodada, pontuações).

### 2.3. Mensagens Baseadas em JSON

Tanto sobre a conexão TCP quanto sobre a WebSocket, o projeto utiliza um protocolo de mensagens customizado baseado em JSON. Cada mensagem é um objeto com uma propriedade `action`, que informa ao receptor o que fazer.

**Exemplo de Mensagem:**

```json
{
  "action": "draw",
  "data": {
    "from": { "x": 10, "y": 20 },
    "to": { "x": 11, "y": 21 }
  }
}
```

As principais ações (`action`) são: `register`, `start_game`, `draw`, `guess`, `update_players`, `game_start`, etc.

### 2.4. E o UDP?

O **UDP (User Datagram Protocol)** é outro protocolo de transporte comum. Ele é "não orientado à conexão" e não garante a entrega ou a ordem dos pacotes. É como enviar uma carta: você envia e torce para que chegue. Sua vantagem é a velocidade e a baixa sobrecarga.

**Este projeto não utiliza UDP.** Embora seja comum em jogos de ação (para enviar atualizações de posição de alta frequência, onde perder um pacote não é crítico), para um jogo como Gartic, a confiabilidade do TCP/WebSocket é mais importante para garantir que todos os desenhos e palpites cheguem corretamente.

## 3. Estrutura do Projeto

-   `src/server.ts`: O coração do backend. Gerencia o estado do jogo, a lista de jogadores, as palavras, os timers e a comunicação com todos os clientes (via TCP e WebSocket).
-   `src/client.ts`: O coração do frontend. Controla a interface do usuário, o canvas de desenho, os inputs do jogador e a comunicação com o servidor WebSocket.
-   `public/index.html`: A estrutura da página web que o jogador vê.
-   `public/client.js`: O arquivo JavaScript **compilado** a partir de `src/client.ts`. É este arquivo que o `index.html` realmente executa.
-   `package.json`: Define as dependências (como `ws` e `typescript`) e os scripts (`start`, `build`).
-   `tsconfig.json`: Arquivo de configuração que instrui o compilador TypeScript sobre como converter os arquivos `.ts` em `.js`.

## 4. Fluxo do Jogo

1.  **Conexão**: O jogador abre o `index.html`, digita um apelido e clica em "Conectar".
2.  **Registro**: O `client.ts` estabelece uma conexão WebSocket com o servidor e envia uma mensagem `{ "action": "register", ... }`.
3.  **Resposta do Servidor**: O servidor (após a correção) recebe a mensagem, adiciona o jogador à lista e responde com `{ "status": "success" }`.
4.  **Mudança de Tela**: O cliente recebe a resposta de sucesso e exibe a tela principal do jogo. O servidor transmite a lista de jogadores atualizada para todos.
5.  **Início do Jogo**: Um jogador clica em "Iniciar Jogo". O servidor muda o estado para `IN_GAME`, escolhe um desenhista e uma palavra secreta.
6.  **Desenho e Palpites**:
    -   O desenhista recebe a palavra e pode desenhar. Cada traço é enviado ao servidor como uma mensagem `draw`.
    -   O servidor retransmite (`broadcast`) os dados do desenho para os outros jogadores.
    -   Os outros jogadores veem o desenho se formando e enviam seus palpites com a mensagem `guess`.
7.  **Fim da Rodada**: Se alguém acerta, o servidor declara o fim da rodada, atualiza as pontuações e inicia o processo para a próxima rodada.

## 5. Como Executar

1.  **Instalar dependências**: `npm install`
2.  **Compilar o código**: `npm run build` (Este passo é **essencial** sempre que você modificar os arquivos `.ts`).
3.  **Iniciar o servidor**: `npm start`
4.  **Jogar**: Abra o arquivo `public/index.html` em um ou mais navegadores.
