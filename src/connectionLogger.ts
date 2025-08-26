import * as fs from "fs";
import * as path from "path";

const logFilePath = path.join(__dirname, "..", "logs", "events.log");

export interface EventLogData {
  timestamp: string;
  eventType: "connection" | "disconnection" | "game_event" | "info" | "error";
  nickname?: string;
  playerId?: string;
  ipAddress?: string;
  connectionType?: "TCP" | "WebSocket";
  message: string;
}

export function logEvent(data: EventLogData) {
  console.log(`[LOG] ${data.eventType.toUpperCase()}: ${data.message}`); // Log to console for real-time view
  const logEntry = JSON.stringify(data) + "\n";

  // Usamos appendFile para adicionar ao log de forma assíncrona
  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) {
      console.error("Falha ao escrever no log de eventos:", err);
    }
  });
}
