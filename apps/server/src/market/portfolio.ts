import type { Portfolio, Position } from '../protocol.js';
import { centsToReais, percentChange } from './simulator.js';

const ACCOUNT_ID = 'SIM-0001';

const HOLDINGS = [
  { symbol: 'ALFA3', quantity: 1000, averagePrice: 3180 },
  { symbol: 'DELT11', quantity: 200, averagePrice: 10850 },
  { symbol: 'OMEG3', quantity: 5000, averagePrice: 1295 },
] as const;

export function buildPortfolio(lastCents: (symbol: string) => number): Portfolio {
  let totalMarketValue = 0;
  let totalUnrealizedPnl = 0;

  const positions = HOLDINGS.map(({ symbol, quantity, averagePrice }): Position => {
    const last = lastCents(symbol);
    const marketValue = quantity * last;
    const unrealizedPnl = (last - averagePrice) * quantity;
    totalMarketValue += marketValue;
    totalUnrealizedPnl += unrealizedPnl;
    return {
      symbol,
      quantity,
      averagePrice: centsToReais(averagePrice),
      lastPrice: centsToReais(last),
      marketValue: centsToReais(marketValue),
      unrealizedPnl: centsToReais(unrealizedPnl),
      unrealizedPnlPercent: percentChange(last - averagePrice, averagePrice),
    };
  });

  return {
    accountId: ACCOUNT_ID,
    totalMarketValue: centsToReais(totalMarketValue),
    totalUnrealizedPnl: centsToReais(totalUnrealizedPnl),
    positions,
  };
}
