import { describe, expect, it } from 'vitest';

import { seededRandom } from '../test-utils.js';
import { buildPortfolio } from './portfolio.js';
import { MarketSimulator } from './simulator.js';

describe('buildPortfolio', () => {
  it('tem ao menos três posições de ativos do catálogo', () => {
    const simulator = new MarketSimulator(seededRandom(3));
    const { positions } = buildPortfolio((symbol) => simulator.lastCents(symbol));
    expect(positions.length).toBeGreaterThanOrEqual(3);
    for (const { symbol } of positions) {
      expect(simulator.symbols).toContain(symbol);
    }
  });

  it('calcula valores e totais a partir do preço em centavos', () => {
    const { positions, totalMarketValue, totalUnrealizedPnl } = buildPortfolio(() => 3333);

    for (const position of positions) {
      const { quantity, averagePrice, marketValue, unrealizedPnl, unrealizedPnlPercent } = position;
      expect(position.lastPrice).toBe(33.33);
      expect(marketValue).toBeCloseTo(quantity * 33.33, 2);
      expect(unrealizedPnl).toBeCloseTo((33.33 - averagePrice) * quantity, 2);
      expect(unrealizedPnlPercent).toBeCloseTo(((33.33 - averagePrice) / averagePrice) * 100, 1);
    }

    expect(totalMarketValue).toBeCloseTo(
      positions.reduce((sum, { marketValue }) => sum + marketValue, 0),
      2,
    );
    expect(totalUnrealizedPnl).toBeCloseTo(
      positions.reduce((sum, { unrealizedPnl }) => sum + unrealizedPnl, 0),
      2,
    );
  });

  it('usa o último preço das cotações e mantém quantidades fixas', () => {
    const simulator = new MarketSimulator(seededRandom(5));
    const initial = buildPortfolio((symbol) => simulator.lastCents(symbol)).positions;

    for (let cycle = 0; cycle < 500; cycle++) {
      simulator.tick();
      const { positions } = buildPortfolio((symbol) => simulator.lastCents(symbol));
      positions.forEach((position, index) => {
        expect(position.lastPrice).toBe(simulator.quote(position.symbol).last);
        expect(position.quantity).toBe(initial[index]!.quantity);
        expect(position.averagePrice).toBe(initial[index]!.averagePrice);
      });
    }
  });
});
