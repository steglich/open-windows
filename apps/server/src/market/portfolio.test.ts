import { describe, expect, it } from 'vitest';

import { OrderLedger, type GeneratedAccount, type Holding } from './orders.js';
import { buildAccountBalance, buildPortfolio } from './portfolio.js';

const HOLDINGS: Holding[] = [
  { symbol: 'PETR4', quantity: 1000, blockedQuantity: 200, averagePrice: 3180 },
  { symbol: 'VALE3', quantity: 200, blockedQuantity: 0, averagePrice: 10850 },
  { symbol: 'ITUB4', quantity: 5000, blockedQuantity: 100, averagePrice: 1295 },
];

const account: GeneratedAccount = {
  ledger: new OrderLedger([]),
  holdings: HOLDINGS,
  availableCents: 10_000_00,
  blockedCents: 2_500_50,
};

describe('buildPortfolio', () => {
  it('calcula valores e totais a partir do preço em centavos', () => {
    const portfolio = buildPortfolio(HOLDINGS, () => 3333);
    const { positions, totalMarketValue, totalUnrealizedPnl, totalUnrealizedPnlPercent } = portfolio;

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

    const cost = positions.reduce(
      (sum, { quantity, averagePrice }) => sum + quantity * averagePrice,
      0,
    );
    expect(totalUnrealizedPnlPercent).toBeCloseTo((totalUnrealizedPnl / cost) * 100, 2);
  });

  it('informa a quantidade bloqueada e preserva a ordem', () => {
    const { positions } = buildPortfolio(HOLDINGS, () => 1000);
    expect(positions.map(({ symbol, blockedQuantity }) => [symbol, blockedQuantity])).toEqual([
      ['PETR4', 200],
      ['VALE3', 0],
      ['ITUB4', 100],
    ]);
  });
});

describe('buildAccountBalance', () => {
  it('converte os saldos para reais', () => {
    const balance = buildAccountBalance(account, () => 1000);
    expect(balance.availableBalance).toBe(10_000);
    expect(balance.blockedBalance).toBe(2_500.5);
  });

  it('soma os saldos ao valor de mercado da carteira', () => {
    const lastCents = (symbol: string) => (symbol === 'PETR4' ? 3333 : 1234);
    const balance = buildAccountBalance(account, lastCents);
    const { totalMarketValue } = buildPortfolio(HOLDINGS, lastCents);

    expect(balance.totalEquity).toBeCloseTo(
      balance.availableBalance + balance.blockedBalance + totalMarketValue,
      2,
    );
  });

  it('usa o mesmo accountId da carteira', () => {
    expect(buildAccountBalance(account, () => 1000).accountId).toBe(
      buildPortfolio(HOLDINGS, () => 1000).accountId,
    );
  });

  it('mantém os saldos constantes quando o preço muda', () => {
    const before = buildAccountBalance(account, () => 1000);
    const after = buildAccountBalance(account, () => 2000);
    expect(after.availableBalance).toBe(before.availableBalance);
    expect(after.blockedBalance).toBe(before.blockedBalance);
    expect(after.totalEquity).toBeGreaterThan(before.totalEquity);
  });
});
