import * as fs from "fs";
import * as path from "path";

const csvFilePath = path.join(__dirname, "..", "logs", "user_registry.csv");
const csvHeader = "timestamp,nickname,userId,connectionType,ipAddress,port\n";

export interface UserRegistryData {
  nickname: string;
  userId: string;
  connectionType: "TCP" | "WebSocket";
  ipAddress?: string;
  port?: number;
}

// Garante que o diretório de logs e o arquivo CSV existam
function ensureCsvFileExists() {
  const logDir = path.dirname(csvFilePath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  if (!fs.existsSync(csvFilePath)) {
    fs.writeFileSync(csvFilePath, csvHeader, "utf-8");
  }
}

export function logUserRegistration(data: UserRegistryData) {
  ensureCsvFileExists();

  const timestamp = new Date().toISOString();
  const port = data.port ?? "N/A";
  const csvRow = `${timestamp},${data.nickname},${data.userId},${data.connectionType},${data.ipAddress},${port}\n`;

  fs.appendFile(csvFilePath, csvRow, (err) => {
    if (err) {
      console.error("Falha ao escrever no registro de usuários (CSV):", err);
    }
  });
}
