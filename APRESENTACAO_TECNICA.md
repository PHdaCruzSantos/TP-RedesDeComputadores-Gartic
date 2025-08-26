# Análise Técnica do Projeto Gartic

Este documento detalha a arquitetura técnica, as escolhas de implementação de rede e a análise de logs do projeto Gartic, um jogo de desenho em tempo real.

## 1. Arquitetura Geral

O projeto segue um modelo **Cliente-Servidor**:

-   **Servidor (Backend):** Desenvolvido em **Node.js com TypeScript**, é o cérebro do sistema. Ele gerencia o estado completo do jogo: conexões de jogadores, pontuações, rodadas, palavras, fila de desenho e a lógica de comunicação.
-   **Cliente (Frontend):** Uma aplicação web construída com **HTML, CSS e TypeScript**. A interface do cliente é responsável por renderizar o jogo (telas de login, jogo, canvas), capturar as ações do usuário (desenhos no canvas, palpites no chat) e se comunicar de forma contínua com o servidor.

A comunicação entre as duas partes é o pilar para a funcionalidade em tempo real do jogo.

## 2. Comunicação em Rede: TCP e WebSockets

O servidor expõe dois endpoints de rede distintos, cada um com um propósito.

### Servidor TCP (`net`)

-   **Biblioteca:** O módulo `net` do Node.js é utilizado para criar um servidor TCP puro.
-   **Porta:** Conforme os logs, ele escuta na porta `2002`.
-   **Propósito:** Um servidor TCP estabelece conexões de baixo nível, baseadas em streams de dados. No contexto deste projeto, ele foi provavelmente concebido para permitir a conexão de clientes não-web (por exemplo, um cliente de terminal ou outra aplicação) que não utilizam o protocolo HTTP/WebSocket. No estado atual do projeto focado na web, este servidor representa uma porta de entrada alternativa ou um ponto de expansão futura.

### Servidor WebSocket (`ws`)

-   **Biblioteca:** A biblioteca `ws` é a principal tecnologia de comunicação para os clientes web.
-   **Porta:** Escuta na porta `8080`.
-   **Propósito:** WebSockets são a escolha ideal para aplicações interativas como esta. Eles estabelecem uma **conexão persistente e full-duplex** (bidirecional) sobre uma única conexão TCP. Isso permite que o servidor envie dados aos clientes de forma proativa (`push`), eliminando a necessidade de o cliente requisitar atualizações (polling). É por meio dessa conexão que o servidor envia em tempo real:
    -   Atualizações de desenho para outros jogadores.
    -   Mensagens de chat e palpites.
    -   Mudanças de estado do jogo (início/fim de rodada, vencedor).
    -   Listas de jogadores e pontuações.

## 3. Análise dos Logs de Conexão

Os arquivos `connections.log` e `user_registry.csv` oferecem insights valiosos sobre a operação da rede.

### Escutando em `0.0.0.0`

Os logs iniciam com:
`[..._Z] Servidor TCP escutando em 0.0.0.0:2002`
`[..._Z] Servidor WebSocket (clientes web) escutando em 0.0.0.0:8080`

-   **`0.0.0.0`**: Este não é um endereço de máquina, mas uma instrução especial que diz ao servidor para aceitar conexões em **todas as interfaces de rede disponíveis** no host (ex: Wi-Fi, Ethernet, localhost). Isso é fundamental para que o servidor seja acessível não apenas localmente, mas também por outros dispositivos na mesma rede ou pela internet (através de um túnel como o Ngrok).

### O Papel do Ngrok e a Evolução dos IPs

A análise dos IPs de conexão nos logs revela o papel central do Ngrok.

**Fase 1: Testes Locais**
`[..._Z] Nova conexão WebSocket de 127.0.0.1`

-   **`127.0.0.1` (localhost):** Este log indica que o cliente (navegador) e o servidor estavam rodando na mesma máquina. O servidor via a conexão como local.

**Fase 2: Acesso Externo com Ngrok (Antes da Correção)**

Mesmo com jogadores externos se conectando através de um link público do Ngrok, os logs inicialmente ainda mostravam `127.0.0.1`. Por quê?

-   **Ngrok como Proxy Reverso:** O Ngrok funciona como um túnel. O tráfego da internet bate nos servidores do Ngrok e é redirecionado para um processo do Ngrok rodando localmente na máquina do servidor. Esse processo local então se conecta ao nosso servidor Node.js. Para o servidor, a conexão vinha do processo local do Ngrok, daí o IP `127.0.0.1`.

**Fase 3: Acesso Externo (Após a Correção)**

`[..._Z] Nova conexão WebSocket de 200.239.155.60`
`[..._Z] Nova conexão WebSocket de 2804:389:...:1e73`

-   **IPs Públicos (IPv4 e IPv6):** Os logs passaram a registrar os IPs reais dos jogadores. A mudança crucial foi a implementação no servidor para ler o cabeçalho HTTP **`X-Forwarded-For`**. O Ngrok anexa este cabeçalho à requisição, contendo o IP original do cliente. Ao priorizar a leitura deste cabeçalho, o servidor consegue "ver através" do túnel do Ngrok e registrar o endereço de origem verdadeiro do jogador.

## 4. Fluxo de uma Sessão de Jogo (Visão de Rede)

1.  **Conexão:** O usuário insere o endereço `wss://...ngrok-free.app` no cliente. O navegador estabelece uma conexão WebSocket segura com o servidor Ngrok.
2.  **Túnel:** O Ngrok encaminha a conexão para o servidor Node.js na porta `8080`. O servidor lê o IP real do cabeçalho `X-Forwarded-For`.
3.  **Registro:** O cliente envia uma mensagem JSON `{ "action": "register", "nickname": "..." }`.
4.  **Broadcast:** O servidor processa o registro, adiciona o jogador à lista e envia uma mensagem `update_players` para **todos** os clientes conectados.
5.  **Ações em Jogo:**
    -   Um `draw` do desenhista é recebido pelo servidor, que o retransmite (`broadcast`) como `drawing_update` para os outros jogadores.
    -   Um `guess` de um jogador é processado centralmente pelo servidor, que decide se está correto e informa o resultado a todos.
6.  **Fim de Jogo:** Ao atingir a pontuação máxima, o servidor calcula o ranking final e envia uma única mensagem `game_over` para todos, que então exibem o resultado.

Esta arquitetura centralizada no servidor garante que todos os jogadores tenham uma visão consistente e sincronizada do estado do jogo.
