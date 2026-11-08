import { deriveSeed, randomInt, seededRandom, type RandomSource } from './random.js';
import type { SimulationVolume } from './volume.js';

/** Candle com preços e `financialVolume` em centavos. */
export interface CandleCents {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  financialVolume: number;
}

export const LOT_SIZE = 100;
export const MINUTE_MS = 60_000;

const DAY_MS = 24 * 60 * MINUTE_MS;
const BRAZIL_OFFSET_MS = 3 * 60 * MINUTE_MS;
/** 10:00 no horário de Brasília. */
const SESSION_OPEN_UTC_MS = 13 * 60 * MINUTE_MS;
const SESSION_CANDLES = 390;

const MIN_PRICE = 300;
const MIN_INITIAL_PRICE = 500;
const MAX_INITIAL_PRICE = 30_000;
const MAX_OPENING_GAP = 0.01;
const MAX_CANDLE_STEP = 0.002;
const MAX_WICK = 0.001;
const MAX_LIQUIDITY_LOTS = 400;

export function floorToMinute(time: number): number {
  return Math.floor(time / MINUTE_MS) * MINUTE_MS;
}

/** Preço mínimo de um ativo no pregão. Mantém positivos todos os níveis do book. */
export function priceFloor(sessionOpen: number): number {
  return Math.max(MIN_PRICE, Math.ceil(sessionOpen / 2));
}

/** Variação aleatória de até `maxRatio` do preço, em centavos inteiros. */
export function priceStep(random: RandomSource, price: number, maxRatio: number): number {
  return Math.round((2 * random() - 1) * Math.floor(price * maxRatio));
}

function logUniform(random: RandomSource, min: number, max: number): number {
  return Math.round(Math.exp(Math.log(min) + random() * (Math.log(max) - Math.log(min))));
}

/** Abertura, em UTC, dos `sessions` dias úteis anteriores ao dia de `reference`, em Brasília. */
function previousSessionStarts(reference: number, sessions: number): number[] {
  const starts: number[] = [];
  let day = Math.floor((reference - BRAZIL_OFFSET_MS) / DAY_MS);
  while (starts.length < sessions) {
    day--;
    const weekday = new Date(day * DAY_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      starts.unshift(day * DAY_MS + SESSION_OPEN_UTC_MS);
    }
  }
  return starts;
}

function nextCandle(
  random: RandomSource,
  time: number,
  open: number,
  floor: number,
  liquidity: number,
): CandleCents {
  const close = Math.max(floor, open + priceStep(random, open, MAX_CANDLE_STEP));
  const wick = Math.max(1, Math.floor(open * MAX_WICK));
  const high = Math.max(open, close) + randomInt(random, 0, wick);
  const low = Math.max(floor, Math.min(open, close) - randomInt(random, 0, wick));
  const volume = LOT_SIZE * randomInt(random, 1, liquidity);
  return {
    time,
    open,
    high,
    low,
    close,
    volume,
    financialVolume: volume * Math.round((open + close) / 2),
  };
}

export interface PriceHistoryOptions {
  seed: number;
  symbols: readonly string[];
  volume: SimulationVolume;
  startTime: number;
}

/**
 * Candles de 1 minuto de todos os ativos. Os pregões fechados ficam em typed arrays compartilhados,
 * pois objetos JS custariam várias vezes mais memória no volume padrão. O pregão corrente cresce
 * a cada minuto e é atualizado pelo simulador.
 */
export class PriceHistory {
  /** Instante do primeiro candle do pregão corrente. */
  readonly currentSessionStart: number;

  private readonly indexBySymbol: ReadonlyMap<string, number>;
  private readonly closedCount: number;
  private readonly closedTimes: Float64Array;
  private readonly closedPrices: Int32Array;
  private readonly closedVolumes: Float64Array;
  private readonly current: CandleCents[][] = [];
  private readonly liquidities: number[] = [];

  constructor({ seed, symbols, volume, startTime }: PriceHistoryOptions) {
    this.indexBySymbol = new Map(symbols.map((symbol, index) => [symbol, index]));

    const lastMinute = floorToMinute(startTime);
    this.currentSessionStart = lastMinute - (volume.currentSessionCandles - 1) * MINUTE_MS;

    this.closedCount = volume.sessions * SESSION_CANDLES;
    this.closedTimes = new Float64Array(this.closedCount);
    this.closedPrices = new Int32Array(symbols.length * this.closedCount * 4);
    this.closedVolumes = new Float64Array(symbols.length * this.closedCount * 2);

    previousSessionStarts(this.currentSessionStart, volume.sessions).forEach((start, session) => {
      for (let minute = 0; minute < SESSION_CANDLES; minute++) {
        this.closedTimes[session * SESSION_CANDLES + minute] = start + minute * MINUTE_MS;
      }
    });

    symbols.forEach((symbol, symbolIndex) => {
      const random = seededRandom(deriveSeed(seed, `history:${symbol}`));
      const liquidity = logUniform(random, 1, MAX_LIQUIDITY_LOTS);
      this.liquidities.push(liquidity);

      const reference = logUniform(random, MIN_INITIAL_PRICE, MAX_INITIAL_PRICE);
      const lastClose = this.generateClosedSessions(random, symbolIndex, reference, liquidity);
      this.current.push(this.generateCurrentSession(random, lastClose, liquidity, volume));
    });
  }

  private generateClosedSessions(
    random: RandomSource,
    symbolIndex: number,
    reference: number,
    liquidity: number,
  ): number {
    let price = reference;
    for (let index = 0; index < this.closedCount; index++) {
      if (index % SESSION_CANDLES === 0) {
        price = Math.max(MIN_PRICE, price + priceStep(random, price, MAX_OPENING_GAP));
      }
      const candle = nextCandle(random, this.closedTimes[index]!, price, MIN_PRICE, liquidity);
      this.storeClosed(symbolIndex, index, candle);
      price = candle.close;
    }
    return price;
  }

  private generateCurrentSession(
    random: RandomSource,
    lastClose: number,
    liquidity: number,
    volume: SimulationVolume,
  ): CandleCents[] {
    let price = Math.max(MIN_PRICE, lastClose + priceStep(random, lastClose, MAX_OPENING_GAP));
    const floor = priceFloor(price);
    const candles: CandleCents[] = [];
    for (let minute = 0; minute < volume.currentSessionCandles; minute++) {
      const time = this.currentSessionStart + minute * MINUTE_MS;
      const candle = nextCandle(random, time, price, floor, liquidity);
      candles.push(candle);
      price = candle.close;
    }
    return candles;
  }

  private storeClosed(symbolIndex: number, index: number, candle: CandleCents): void {
    const prices = (symbolIndex * this.closedCount + index) * 4;
    this.closedPrices[prices] = candle.open;
    this.closedPrices[prices + 1] = candle.high;
    this.closedPrices[prices + 2] = candle.low;
    this.closedPrices[prices + 3] = candle.close;

    const volumes = (symbolIndex * this.closedCount + index) * 2;
    this.closedVolumes[volumes] = candle.volume;
    this.closedVolumes[volumes + 1] = candle.financialVolume;
  }

  private symbolIndex(symbol: string): number {
    const index = this.indexBySymbol.get(symbol);
    if (index === undefined) {
      throw new Error(`Ativo desconhecido: ${symbol}`);
    }
    return index;
  }

  /** Lotes máximos negociados por minuto no ativo. */
  liquidity(symbol: string): number {
    return this.liquidities[this.symbolIndex(symbol)]!;
  }

  /** Candles do pregão corrente. O simulador altera esta lista diretamente. */
  currentCandles(symbol: string): CandleCents[] {
    return this.current[this.symbolIndex(symbol)]!;
  }

  previousClose(symbol: string): number {
    return this.candleAt(symbol, this.closedCount - 1).close;
  }

  /** Quantidade de candles de cada ativo, somando os pregões fechados e o corrente. */
  size(symbol: string): number {
    return this.closedCount + this.currentCandles(symbol).length;
  }

  timeAt(symbol: string, index: number): number {
    return index < this.closedCount
      ? this.closedTimes[index]!
      : this.currentCandles(symbol)[index - this.closedCount]!.time;
  }

  candleAt(symbol: string, index: number): CandleCents {
    if (index >= this.closedCount) {
      return this.currentCandles(symbol)[index - this.closedCount]!;
    }
    const position = this.symbolIndex(symbol) * this.closedCount + index;
    const prices = position * 4;
    const volumes = position * 2;
    return {
      time: this.closedTimes[index]!,
      open: this.closedPrices[prices]!,
      high: this.closedPrices[prices + 1]!,
      low: this.closedPrices[prices + 2]!,
      close: this.closedPrices[prices + 3]!,
      volume: this.closedVolumes[volumes]!,
      financialVolume: this.closedVolumes[volumes + 1]!,
    };
  }

  /** Os `limit` candles mais recentes com `time` anterior a `before`, em ordem crescente. */
  query(symbol: string, limit: number, before?: number): CandleCents[] {
    const end = before === undefined ? this.size(symbol) : this.firstIndexAtOrAfter(symbol, before);
    const candles: CandleCents[] = [];
    for (let index = Math.max(0, end - limit); index < end; index++) {
      candles.push(this.candleAt(symbol, index));
    }
    return candles;
  }

  private firstIndexAtOrAfter(symbol: string, time: number): number {
    let low = 0;
    let high = this.size(symbol);
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.timeAt(symbol, middle) < time) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }
}
