import type { AccountBalance, Portfolio, Position } from '../protocol.js';
import type { GeneratedAccount, Holding } from './orders.js';
import { centsToReais, percentChange } from './simulator.js';

const ACCOUNT_ID = 'SIM-0001';

type LastCents = (symbol: string) => number;

export function buildPortfolio(holdings: readonly Holding[], lastCents: LastCents): Portfolio {
  let totalMarketValue = 0;
  let totalUnrealizedPnl = 0;
  let totalCost = 0;

  const positions = holdings.map(
    ({ symbol, quantity, blockedQuantity, averagePrice }): Position => {
      const last = lastCents(symbol);
      const marketValue = quantity * last;
      const unrealizedPnl = (last - averagePrice) * quantity;
      totalMarketValue += marketValue;
      totalUnrealizedPnl += unrealizedPnl;
      totalCost += quantity * averagePrice;
      return {
        symbol,
        quantity,
        blockedQuantity,
        averagePrice: centsToReais(averagePrice),
        lastPrice: centsToReais(last),
        marketValue: centsToReais(marketValue),
        unrealizedPnl: centsToReais(unrealizedPnl),
        unrealizedPnlPercent: percentChange(last - averagePrice, averagePrice),
      };
    },
  );

  return {
    accountId: ACCOUNT_ID,
    totalMarketValue: centsToReais(totalMarketValue),
    totalUnrealizedPnl: centsToReais(totalUnrealizedPnl),
    totalUnrealizedPnlPercent: percentChange(totalUnrealizedPnl, totalCost),
    positions,
  };
}

export function buildAccountBalance(
  { holdings, availableCents, blockedCents }: GeneratedAccount,
  lastCents: LastCents,
): AccountBalance {
  const totalMarketValue = holdings.reduce(
    (sum, { symbol, quantity }) => sum + quantity * lastCents(symbol),
    0,
  );
  return {
    accountId: ACCOUNT_ID,
    availableBalance: centsToReais(availableCents),
    blockedBalance: centsToReais(blockedCents),
    totalEquity: centsToReais(availableCents + blockedCents + totalMarketValue),
  };
}
