import type { BookLevel, OrderBook, Quote } from '../protocol.js';

export type RandomSource = () => number;

const INSTRUMENTS = [
  { symbol: 'ALFA3', previousClose: 3250 },
  { symbol: 'BETA4', previousClose: 1875 },
  { symbol: 'GAMA3', previousClose: 8420 },
  { symbol: 'DELT11', previousClose: 11290 },
  { symbol: 'OMEG3', previousClose: 1240 },
  { symbol: 'SIGM4', previousClose: 4575 },
] as const;

const BOOK_DEPTH = 5;
const LOT_SIZE = 100;
const MAX_OPENING_GAP = 0.01;
const MAX_STEP = 0.005;

/** Todos os preços do estado são inteiros em centavos. */
interface MarketState {
  symbol: string;
  previousClose: number;
  open: number;
  floor: number;
  last: number;
  high: number;
  low: number;
  volume: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export function centsToReais(cents: number): number {
  return cents / 100;
}

export function percentChange(delta: number, base: number): number {
  return Math.round((delta / base) * 10_000) / 100;
}

export class MarketSimulator {
  readonly symbols: readonly string[] = INSTRUMENTS.map(({ symbol }) => symbol);

  private readonly states = new Map<string, MarketState>();

  constructor(private readonly random: RandomSource = Math.random) {
    for (const { symbol, previousClose } of INSTRUMENTS) {
      const open = previousClose + this.step(previousClose, MAX_OPENING_GAP);
      const state: MarketState = {
        symbol,
        previousClose,
        open,
        floor: Math.ceil(open / 2),
        last: open,
        high: open,
        low: open,
        volume: 0,
        bids: [],
        asks: [],
      };
      this.refreshBook(state);
      this.states.set(symbol, state);
    }
  }

  tick(): void {
    for (const state of this.states.values()) {
      state.last = Math.max(state.floor, state.last + this.step(state.last, MAX_STEP));
      state.high = Math.max(state.high, state.last);
      state.low = Math.min(state.low, state.last);
      state.volume += LOT_SIZE * this.randomInt(1, 50);
      this.refreshBook(state);
    }
  }

  quote(symbol: string): Quote {
    const state = this.state(symbol);
    const delta = state.last - state.previousClose;
    return {
      symbol,
      last: centsToReais(state.last),
      bid: centsToReais(state.bids[0]!.price),
      ask: centsToReais(state.asks[0]!.price),
      open: centsToReais(state.open),
      high: centsToReais(state.high),
      low: centsToReais(state.low),
      previousClose: centsToReais(state.previousClose),
      change: centsToReais(delta),
      changePercent: percentChange(delta, state.previousClose),
      volume: state.volume,
    };
  }

  book(symbol: string): OrderBook {
    const { bids, asks } = this.state(symbol);
    const toReais = (level: BookLevel): BookLevel => ({
      ...level,
      price: centsToReais(level.price),
    });
    return { symbol, bids: bids.map(toReais), asks: asks.map(toReais) };
  }

  lastCents(symbol: string): number {
    return this.state(symbol).last;
  }

  private state(symbol: string): MarketState {
    const state = this.states.get(symbol);
    if (!state) {
      throw new Error(`Ativo desconhecido: ${symbol}`);
    }
    return state;
  }

  private step(price: number, maxRatio: number): number {
    return Math.round((2 * this.random() - 1) * Math.floor(price * maxRatio));
  }

  private refreshBook(state: MarketState): void {
    state.bids = this.buildSide(state.last - this.randomInt(1, 3), -1);
    state.asks = this.buildSide(state.last + this.randomInt(1, 3), 1);
  }

  private buildSide(bestPrice: number, direction: 1 | -1): BookLevel[] {
    const levels: BookLevel[] = [];
    let price = bestPrice;
    for (let depth = 0; depth < BOOK_DEPTH; depth++) {
      levels.push({
        price,
        quantity: LOT_SIZE * this.randomInt(1, 50),
        orders: this.randomInt(1, 20),
      });
      price += direction * this.randomInt(1, 5);
    }
    return levels;
  }

  private randomInt(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }
}
