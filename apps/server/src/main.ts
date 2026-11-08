import { startGateway } from './gateway.js';

function readPort(): number {
  const raw = process.env.PORT;
  if (!raw) {
    return 8090;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT inválida: ${raw}`);
  }
  return port;
}

const host = process.env.HOST || '127.0.0.1';
const gateway = await startGateway({ port: readPort(), host });

console.log(`Simulador disponível em ws://${host}:${gateway.port}`);

function shutdown(): void {
  void gateway.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
