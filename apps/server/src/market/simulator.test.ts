import { describe, expect, it } from 'vitest';

import { hasAtMostTwoDecimals, seededRandom } from '../test-utils.js';
import { MarketSimulator } from './simulator.js';

const CYCLES = 5_000;

function forEachCycle(check: (simulator: MarketSimulator, symbol: string) => void): void {
  const simulator = new MarketSimulator(seededRandom(42));
  for (let cycle = 0; cycle < CYCLES; cycle++) {
    simulator.tick();
    for (const symbol of simulator.symbols) {
      check(simulator, symbol);
    }
  }
}

describe('MarketSimulator', () => {
  it('oferece ao menos cinco ativos distintos', () => {
    const { symbols } = new MarketSimulator(seededRandom(1));
    expect(new Set(symbols).size).toBeGreaterThanOrEqual(5);
  });

  it('disponibiliza cotação e book antes do primeiro ciclo', () => {
    const simulator = new MarketSimulator(seededRandom(1));
    const symbol = simulator.symbols[0]!;
    expect(simulator.quote(symbol).symbol).toBe(symbol);
    expect(simulator.book(symbol).bids).toHaveLength(5);
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
        const { symbol: _symbol, volume: _volume, ...values } = simulator.quote(symbol);
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
      const simulator = new MarketSimulator(seededRandom(7));
      for (const symbol of simulator.symbols) {
        const prices = new Set<number>();
        let previous = simulator.quote(symbol).last;
        for (let cycle = 0; cycle < CYCLES; cycle++) {
          simulator.tick();
          const { last } = simulator.quote(symbol);
          expect(Math.abs(last - previous) / previous).toBeLessThanOrEqual(0.01);
          prices.add(last);
          previous = last;
        }
        expect(prices.size).toBeGreaterThan(1);
      }
    });

    it('mantém o volume inteiro e não decrescente', () => {
      const previous = new Map<string, number>();
      forEachCycle((simulator, symbol) => {
        const { volume } = simulator.quote(symbol);
        expect(Number.isInteger(volume)).toBe(true);
        expect(volume).toBeGreaterThanOrEqual(previous.get(symbol) ?? 0);
        previous.set(symbol, volume);
      });
    });
  });

  describe('book', () => {
    it('tem cinco níveis válidos por lado', () => {
      forEachCycle((simulator, symbol) => {
        const { bids, asks } = simulator.book(symbol);
        expect(bids).toHaveLength(5);
        expect(asks).toHaveLength(5);
        for (const { price, quantity, orders } of [...bids, ...asks]) {
          expect(price).toBeGreaterThan(0);
          expect(hasAtMostTwoDecimals(price)).toBe(true);
          expect(Number.isInteger(quantity) && quantity > 0).toBe(true);
          expect(Number.isInteger(orders) && orders > 0).toBe(true);
        }
      });
    });

    it('ordena os níveis de forma estrita', () => {
      forEachCycle((simulator, symbol) => {
        const { bids, asks } = simulator.book(symbol);
        for (let level = 1; level < 5; level++) {
          expect(bids[level]!.price).toBeLessThan(bids[level - 1]!.price);
          expect(asks[level]!.price).toBeGreaterThan(asks[level - 1]!.price);
        }
      });
    });

    it('não cruza e tem as melhores ofertas iguais às da cotação', () => {
      forEachCycle((simulator, symbol) => {
        const { bids, asks } = simulator.book(symbol);
        const { bid, ask } = simulator.quote(symbol);
        expect(bids[0]!.price).toBeLessThan(asks[0]!.price);
        expect(bids[0]!.price).toBe(bid);
        expect(asks[0]!.price).toBe(ask);
      });
    });
  });
});
