import { describe, expect, it } from 'vitest';

import { hasAtMostTwoDecimals } from '../test-utils.js';
import { MarketSimulator } from './simulator.js';

const CYCLES = 2_000;
const CYCLE_MS = 500;
const START_TIME = Date.parse('2026-01-07T16:00:00-03:00');
const BOOK_DEPTH = 50;
const BOOK_CYCLES = 100;

function create(seed: number): MarketSimulator {
  return new MarketSimulator({
    seed,
    startTime: START_TIME,
    volume: { assets: 8, bookDepth: BOOK_DEPTH, orders: 100, positions: 3, sessions: 2 },
  });
}

function forEachCycle(
  check: (simulator: MarketSimulator, symbol: string) => void,
  cycles = CYCLES,
): void {
  const simulator = create(42);
  for (let cycle = 1; cycle <= cycles; cycle++) {
    simulator.tick(START_TIME + cycle * CYCLE_MS);
    for (const symbol of simulator.symbols) {
      check(simulator, symbol);
    }
  }
}

describe('MarketSimulator', () => {
  it('usa os tickers do catálogo sem repetição', () => {
    const { symbols } = create(1);
    expect(symbols.slice(0, 2)).toEqual(['PETR4', 'VALE3']);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('disponibiliza cotação e book antes do primeiro ciclo', () => {
    const simulator = create(1);
    const symbol = simulator.symbols[0]!;
    expect(simulator.quote(symbol).symbol).toBe(symbol);
    expect(simulator.quote(symbol).updatedAt).toBe(START_TIME);
    expect(simulator.book(symbol).bids).toHaveLength(BOOK_DEPTH);
  });

  describe('cotações', () => {
    it('mantém as relações de preço', () => {
      forEachCycle((simulator, symbol) => {
        const quote = simulator.quote(symbol);
        expect(quote.last).toBeGreaterThan(0);
        expect(quote.bid).toBeGreaterThan(0);
        expect(quote.bid).toBeLessThan(quote.ask);
        expect(quote.low).toBeLessThanOrEqual(quote.last);
        expect(quote.last).toBeLessThanOrEqual(quote.high);
      });
    });

    it('arredonda preços e variações a duas casas', () => {
      forEachCycle((simulator, symbol) => {
        const {
          symbol: _symbol,
          volume: _volume,
          financialVolume: _financialVolume,
          updatedAt: _updatedAt,
          ...values
        } = simulator.quote(symbol);
        for (const value of Object.values(values)) {
          expect(hasAtMostTwoDecimals(value)).toBe(true);
        }
      });
    });

    it('calcula a variação sobre o fechamento anterior', () => {
      forEachCycle((simulator, symbol) => {
        const { last, previousClose, change, changePercent } = simulator.quote(symbol);
        expect(change).toBeCloseTo(last - previousClose, 2);
        expect(changePercent).toBeCloseTo(((last - previousClose) / previousClose) * 100, 1);
      });
    });

    it('nunca varia mais de 1% entre ciclos e o preço se move', () => {
      const simulator = create(7);
      const previous = new Map(simulator.symbols.map((symbol) => [symbol, simulator.quote(symbol).last]));
      const seen = new Map(simulator.symbols.map((symbol) => [symbol, new Set<number>()]));

      for (let cycle = 1; cycle <= CYCLES; cycle++) {
        simulator.tick(START_TIME + cycle * CYCLE_MS);
        for (const symbol of simulator.symbols) {
          const { last } = simulator.quote(symbol);
          const before = previous.get(symbol)!;
          expect(Math.abs(last - before) / before).toBeLessThanOrEqual(0.01);
          seen.get(symbol)!.add(last);
          previous.set(symbol, last);
        }
      }

      for (const prices of seen.values()) {
        expect(prices.size).toBeGreaterThan(1);
      }
    });

    it('mantém os volumes não decrescentes e o volume inteiro', () => {
      const previous = new Map<string, { volume: number; financialVolume: number }>();
      forEachCycle((simulator, symbol) => {
        const { volume, financialVolume } = simulator.quote(symbol);
        const before = previous.get(symbol);
        expect(Number.isInteger(volume)).toBe(true);
        expect(volume).toBeGreaterThanOrEqual(before?.volume ?? 0);
        expect(financialVolume).toBeGreaterThanOrEqual(before?.financialVolume ?? 0);
        previous.set(symbol, { volume, financialVolume });
      });
    });

    it('registra o instante do último ciclo', () => {
      const simulator = create(3);
      const now = START_TIME + 12_345;
      simulator.tick(now);
      expect(simulator.quote('PETR4').updatedAt).toBe(now);
    });
  });

  describe('coerência com o histórico', () => {
    function expectQuoteMatchesCandles(simulator: MarketSimulator, symbol: string): void {
      const quote = simulator.quote(symbol);
      const today = simulator.history.currentCandles(symbol);

      expect(Math.round(quote.open * 100)).toBe(today[0]!.open);
      expect(Math.round(quote.high * 100)).toBe(Math.max(...today.map(({ high }) => high)));
      expect(Math.round(quote.low * 100)).toBe(Math.min(...today.map(({ low }) => low)));
      expect(Math.round(quote.last * 100)).toBe(today.at(-1)!.close);
      expect(quote.volume).toBe(today.reduce((sum, { volume }) => sum + volume, 0));
      expect(Math.round(quote.financialVolume * 100)).toBe(
        today.reduce((sum, { financialVolume }) => sum + financialVolume, 0),
      );
      expect(Math.round(quote.previousClose * 100)).toBe(simulator.history.previousClose(symbol));
    }

    it('coincide com os candles do pregão antes do primeiro ciclo', () => {
      const simulator = create(5);
      simulator.symbols.forEach((symbol) => expectQuoteMatchesCandles(simulator, symbol));
    });

    it('continua coincidindo depois de vários minutos de ciclos', () => {
      const simulator = create(5);
      for (let cycle = 1; cycle <= CYCLES; cycle++) {
        simulator.tick(START_TIME + cycle * CYCLE_MS);
      }
      simulator.symbols.forEach((symbol) => expectQuoteMatchesCandles(simulator, symbol));
    });

    it('abre um novo candle a cada minuto do relógio', () => {
      const simulator = create(5);
      const before = simulator.history.currentCandles('PETR4').length;

      simulator.tick(START_TIME + 30_000);
      expect(simulator.history.currentCandles('PETR4')).toHaveLength(before);

      simulator.tick(START_TIME + 60_000);
      const candles = simulator.history.currentCandles('PETR4');
      expect(candles).toHaveLength(before + 1);
      expect(candles.at(-1)!.time).toBe(START_TIME + 60_000);
    });

    it('converte os candles consultados para reais', () => {
      const simulator = create(5);
      const [candle] = simulator.candles('PETR4', 1);
      const raw = simulator.history.currentCandles('PETR4').at(-1)!;
      expect(candle!.close).toBe(raw.close / 100);
      expect(candle!.financialVolume).toBe(raw.financialVolume / 100);
    });
  });

  describe('book', () => {
    it('tem 50 níveis válidos por lado', () => {
      forEachCycle((simulator, symbol) => {
        const { bids, asks } = simulator.book(symbol);
        expect(bids).toHaveLength(BOOK_DEPTH);
        expect(asks).toHaveLength(BOOK_DEPTH);
        for (const { price, quantity, orders } of [...bids, ...asks]) {
          expect(price).toBeGreaterThan(0);
          expect(hasAtMostTwoDecimals(price)).toBe(true);
          expect(Number.isInteger(quantity) && quantity > 0).toBe(true);
          expect(Number.isInteger(orders) && orders > 0).toBe(true);
        }
      }, BOOK_CYCLES);
    });

    it('ordena os níveis de forma estrita', () => {
      forEachCycle((simulator, symbol) => {
        const { bids, asks } = simulator.book(symbol);
        for (let level = 1; level < BOOK_DEPTH; level++) {
          expect(bids[level]!.price).toBeLessThan(bids[level - 1]!.price);
          expect(asks[level]!.price).toBeGreaterThan(asks[level - 1]!.price);
        }
      }, BOOK_CYCLES);
    });

    it('não cruza, calcula o spread e tem as melhores ofertas iguais às da cotação', () => {
      forEachCycle((simulator, symbol) => {
        const { bids, asks, spread } = simulator.book(symbol);
        const { bid, ask } = simulator.quote(symbol);
        expect(bids[0]!.price).toBeLessThan(asks[0]!.price);
        expect(bids[0]!.price).toBe(bid);
        expect(asks[0]!.price).toBe(ask);
        expect(spread).toBeGreaterThan(0);
        expect(spread).toBeCloseTo(asks[0]!.price - bids[0]!.price, 2);
      }, BOOK_CYCLES);
    });

    it('devolve o mesmo book em consultas repetidas no ciclo', () => {
      const simulator = create(4);
      simulator.tick(START_TIME + CYCLE_MS);
      expect(simulator.book('PETR4')).toEqual(simulator.book('PETR4'));
    });

    it('mantém preços positivos mesmo com o último preço no piso', () => {
      const simulator = create(4);
      const state = (simulator as unknown as { states: Map<string, { last: number; floor: number }> })
        .states.get('PETR4')!;
      state.floor = 300;
      state.last = 300;
      simulator.tick(START_TIME + CYCLE_MS);

      const { bids } = simulator.book('PETR4');
      expect(bids.at(-1)!.price).toBeGreaterThan(0);
    });
  });

  describe('reprodutibilidade', () => {
    function snapshot(simulator: MarketSimulator): unknown {
      return simulator.symbols.map((symbol) => simulator.quote(symbol));
    }

    it('reproduz as cotações mesmo sem consultar o book', () => {
      const withBook = create(9);
      const withoutBook = create(9);
      for (let cycle = 1; cycle <= 50; cycle++) {
        const now = START_TIME + cycle * CYCLE_MS;
        withBook.tick(now);
        withoutBook.tick(now);
        withBook.symbols.forEach((symbol) => withBook.book(symbol));
        expect(snapshot(withBook)).toEqual(snapshot(withoutBook));
      }
    });

    it('reproduz o book do mesmo ciclo', () => {
      const first = create(9);
      const second = create(9);
      first.tick(START_TIME + CYCLE_MS);
      second.tick(START_TIME + CYCLE_MS);
      expect(first.book('VALE3')).toEqual(second.book('VALE3'));
    });

    it('muda o book entre ciclos', () => {
      const simulator = create(9);
      simulator.tick(START_TIME + CYCLE_MS);
      const first = simulator.book('VALE3').bids;
      simulator.tick(START_TIME + 2 * CYCLE_MS);
      expect(simulator.book('VALE3').bids).not.toEqual(first);
    });
  });
});
