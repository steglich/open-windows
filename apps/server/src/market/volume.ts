import { TICKERS } from './tickers.js';

export interface SimulationVolume {
  assets: number;
  /** Níveis por lado do book. */
  bookDepth: number;
  orders: number;
  positions: number;
  /** Pregões completos anteriores ao corrente. */
  sessions: number;
  /** Candles já existentes no pregão corrente quando o servidor parte. */
  currentSessionCandles: number;
}

export const DEFAULT_VOLUME: Readonly<SimulationVolume> = {
  assets: 500,
  bookDepth: 50,
  orders: 10_000,
  positions: 300,
  sessions: 5,
  currentSessionCandles: 120,
};

/** Além deste limite, o piso de preço não garante níveis positivos no book. */
const MAX_BOOK_DEPTH = 50;
/** As ordens abertas usam os últimos 30 minutos do pregão corrente. */
const MIN_CURRENT_SESSION_CANDLES = 31;

function requireInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Volume inválido: ${name} deve ser um inteiro entre ${min} e ${max}.`);
  }
}

export function resolveVolume(overrides: Partial<SimulationVolume> = {}): SimulationVolume {
  const volume = { ...DEFAULT_VOLUME, ...overrides };

  requireInRange('assets', volume.assets, 1, TICKERS.length);
  requireInRange('bookDepth', volume.bookDepth, 1, MAX_BOOK_DEPTH);
  requireInRange('positions', volume.positions, 1, volume.assets);
  // Cada posição precisa de ao menos uma compra executada, e só parte das ordens é executada.
  requireInRange('orders', volume.orders, volume.positions * 2, Number.MAX_SAFE_INTEGER);
  requireInRange('sessions', volume.sessions, 1, Number.MAX_SAFE_INTEGER);
  requireInRange(
    'currentSessionCandles',
    volume.currentSessionCandles,
    MIN_CURRENT_SESSION_CANDLES,
    Number.MAX_SAFE_INTEGER,
  );

  return volume;
}
