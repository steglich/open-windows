import type { BookLevel, Candle, OrderBook, Quote } from '../protocol.js';
import {
  floorToMinute,
  LOT_SIZE,
  priceFloor,
  priceStep,
  PriceHistory,
  type CandleCents,
} from './history.js';
import { deriveSeed, randomInt, seededRandom, type RandomSource } from './random.js';
import { TICKERS } from './tickers.js';
import { resolveVolume, type SimulationVolume } from './volume.js';

const MAX_STEP = 0.005;
const MAX_LEVEL_GAP = 3;
const MAX_BOOK_LOTS = 50;
const MAX_SPREAD_HALF = 3;
/** Divide os lotes de um minuto de negociação em ciclos. */
const TICK_LIQUIDITY_DIVISOR = 10;

/** Todos os preços e valores financeiros do estado são inteiros em centavos. */
interface MarketState {
  symbol: string;
  previousClose: number;
  open: number;
  floor: number;
  last: number;
  high: number;
  low: number;
  volume: number;
  financialVolume: number;
  bestBid: number;
  bestAsk: number;
  updatedAt: number;
  maxTickLots: number;
  candles: CandleCents[];
  book?: OrderBook;
  bookCycle: number;
}

export function centsToReais(cents: number): number {
  return cents / 100;
}

export function percentChange(delta: number, base: number): number {
  return Math.round((delta / base) * 10_000) / 100;
}

export function toCandle(candle: CandleCents): Candle {
  return {
    ...candle,
    open: centsToReais(candle.open),
    high: centsToReais(candle.high),
    low: centsToReais(candle.low),
    close: centsToReais(candle.close),
    financialVolume: centsToReais(candle.financialVolume),
  };
}

export interface MarketSimulatorOptions {
  seed: number;
  startTime: number;
  volume?: Partial<SimulationVolume>;
}

export class MarketSimulator {
  readonly symbols: readonly string[];
  readonly volume: SimulationVolume;
  readonly history: PriceHistory;

  private readonly seed: number;
  private readonly random: RandomSource;
  private readonly states = new Map<string, MarketState>();
  private cycle = 0;

  constructor({ seed, startTime, volume }: MarketSimulatorOptions) {
    this.seed = seed;
    this.volume = resolveVolume(volume);
    this.symbols = TICKERS.slice(0, this.volume.assets);
    this.history = new PriceHistory({
      seed,
      symbols: this.symbols,
      volume: this.volume,
      startTime,
    });
    this.random = seededRandom(deriveSeed(seed, 'tick'));

    for (const symbol of this.symbols) {
      const candles = this.history.currentCandles(symbol);
      const open = candles[0]!.open;
      const last = candles.at(-1)!.close;
      const state: MarketState = {
        symbol,
        previousClose: this.history.previousClose(symbol),
        open,
        floor: priceFloor(open),
        last,
        high: Math.max(...candles.map(({ high }) => high)),
        low: Math.min(...candles.map(({ low }) => low)),
        volume: candles.reduce((sum, { volume: quantity }) => sum + quantity, 0),
        financialVolume: candles.reduce((sum, candle) => sum + candle.financialVolume, 0),
        bestBid: 0,
        bestAsk: 0,
        updatedAt: startTime,
        maxTickLots: Math.ceil(this.history.liquidity(symbol) / TICK_LIQUIDITY_DIVISOR),
        candles,
        bookCycle: -1,
      };
      this.refreshBestOffers(state);
      this.states.set(symbol, state);
    }
  }

  /** Consome sempre a mesma quantidade de números por ativo, para que a seed reproduza os dados. */
  tick(now: number): void {
    this.cycle++;
    const minute = floorToMinute(now);

    for (const state of this.states.values()) {
      state.last = Math.max(state.floor, state.last + priceStep(this.random, state.last, MAX_STEP));
      state.high = Math.max(state.high, state.last);
      state.low = Math.min(state.low, state.last);
      state.updatedAt = now;

      const quantity = LOT_SIZE * randomInt(this.random, 1, state.maxTickLots);
      const financial = quantity * state.last;
      state.volume += quantity;
      state.financialVolume += financial;

      this.updateCandle(state, minute, quantity, financial);
      this.refreshBestOffers(state);
    }
  }

  quote(symbol: string): Quote {
    const state = this.state(symbol);
    const delta = state.last - state.previousClose;
    return {
      symbol,
      last: centsToReais(state.last),
      bid: centsToReais(state.bestBid),
      ask: centsToReais(state.bestAsk),
      open: centsToReais(state.open),
      high: centsToReais(state.high),
      low: centsToReais(state.low),
      previousClose: centsToReais(state.previousClose),
      change: centsToReais(delta),
      changePercent: percentChange(delta, state.previousClose),
      volume: state.volume,
      financialVolume: centsToReais(state.financialVolume),
      updatedAt: state.updatedAt,
    };
  }

  /** Calculado sob demanda e mantido durante o ciclo, sem criar 50 mil objetos por ciclo à toa. */
  book(symbol: string): OrderBook {
    const state = this.state(symbol);
    if (state.bookCycle !== this.cycle) {
      state.book = this.buildBook(state);
      state.bookCycle = this.cycle;
    }
    return state.book!;
  }

  candles(symbol: string, limit: number, before?: number): Candle[] {
    return this.history.query(symbol, limit, before).map(toCandle);
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

  private updateCandle(
    state: MarketState,
    minute: number,
    quantity: number,
    financial: number,
  ): void {
    let candle = state.candles.at(-1)!;
    if (candle.time < minute) {
      candle = {
        time: minute,
        open: state.last,
        high: state.last,
        low: state.last,
        close: state.last,
        volume: 0,
        financialVolume: 0,
      };
      state.candles.push(candle);
    }
    candle.close = state.last;
    candle.high = Math.max(candle.high, state.last);
    candle.low = Math.min(candle.low, state.last);
    candle.volume += quantity;
    candle.financialVolume += financial;
  }

  private refreshBestOffers(state: MarketState): void {
    state.bestBid = state.last - randomInt(this.random, 1, MAX_SPREAD_HALF);
    state.bestAsk = state.last + randomInt(this.random, 1, MAX_SPREAD_HALF);
  }

  private buildBook(state: MarketState): OrderBook {
    const random = seededRandom(deriveSeed(this.seed, `book:${state.symbol}:${this.cycle}`));
    return {
      symbol: state.symbol,
      spread: centsToReais(state.bestAsk - state.bestBid),
      bids: this.buildSide(random, state.bestBid, -1),
      asks: this.buildSide(random, state.bestAsk, 1),
    };
  }

  private buildSide(random: RandomSource, bestPrice: number, direction: 1 | -1): BookLevel[] {
    const levels: BookLevel[] = [];
    let price = bestPrice;
    for (let depth = 0; depth < this.volume.bookDepth; depth++) {
      const lots = randomInt(random, 1, MAX_BOOK_LOTS);
      levels.push({
        price: centsToReais(price),
        quantity: LOT_SIZE * lots,
        orders: randomInt(random, 1, lots),
      });
      price += direction * randomInt(random, 1, MAX_LEVEL_GAP);
    }
    return levels;
  }
}
