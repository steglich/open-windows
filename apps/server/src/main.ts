import { startGateway } from './gateway.js';

const MAX_SEED = 4_294_967_295;

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

function readSeed(): number | undefined {
  const raw = process.env.SEED;
  if (!raw) {
    return undefined;
  }
  const seed = Number(raw);
  if (!/^\d+$/.test(raw) || seed > MAX_SEED) {
    throw new Error(`SEED inválida: ${raw}. Use um inteiro entre 0 e ${MAX_SEED}.`);
  }
  return seed;
}

const host = process.env.HOST || '127.0.0.1';
const gateway = await startGateway({ port: readPort(), host, seed: readSeed() });

console.log(`Simulador disponível em ws://${host}:${gateway.port} (seed ${gateway.seed})`);

function shutdown(): void {
  void gateway.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
