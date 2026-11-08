import { describe, expect, it } from 'vitest';

import { ORDER_STATUSES, type Order } from '../protocol.js';
import { PriceHistory } from './history.js';
import { generateAccount, type GeneratedAccount } from './orders.js';
import { TICKERS } from './tickers.js';
import { resolveVolume } from './volume.js';

const START_TIME = Date.parse('2026-01-07T16:00:00-03:00');
const CUTOFF = START_TIME - 30 * 60_000;
const LOT = 100;
const volume = resolveVolume({
  assets: 30,
  bookDepth: 5,
  orders: 2_000,
  positions: 15,
  sessions: 3,
});
const symbols = TICKERS.slice(0, volume.assets);

function setup(seed = 42): { account: GeneratedAccount; history: PriceHistory; orders: Order[] } {
  const history = new PriceHistory({ seed, symbols, volume, startTime: START_TIME });
  const account = generateAccount({ history, symbols, seed, volume, startTime: START_TIME });
  const orders = account.ledger.query({ offset: 0, limit: volume.orders }).items;
  return { account, history, orders };
}

const { account, history, orders } = setup();
const isActive = ({ status }: Order) => status === 'OPEN' || status === 'PARTIALLY_FILLED';
const remaining = (order: Order) => order.requestedQuantity - order.filledQuantity;

describe('generateAccount', () => {
  it('gera exatamente o volume pedido, com IDs únicos', () => {
    expect(orders).toHaveLength(volume.orders);
    expect(new Set(orders.map(({ id }) => id)).size).toBe(volume.orders);
    expect(account.holdings).toHaveLength(volume.positions);
  });

  it('cobre todos os status', () => {
    const count = (status: Order['status']) => orders.filter((o) => o.status === status).length;
    expect(count('OPEN')).toBe(200);
    expect(count('PARTIALLY_FILLED')).toBe(100);
    expect(count('CANCELLED')).toBe(500);
    expect(count('FILLED')).toBe(1_200);
  });

  it('cobre tipos, lados e validades', () => {
    expect(new Set(orders.map(({ type }) => type))).toEqual(new Set(['LIMIT', 'MARKET']));
    expect(new Set(orders.map(({ side }) => side))).toEqual(new Set(['BUY', 'SELL']));
    expect(new Set(orders.map(({ validity }) => validity))).toEqual(new Set(['DAY', 'GTC']));
  });

  it('mantém as quantidades coerentes com o status', () => {
    for (const { status, requestedQuantity, filledQuantity } of orders) {
      expect(requestedQuantity % LOT).toBe(0);
      expect(filledQuantity % LOT).toBe(0);
      expect(requestedQuantity).toBeGreaterThan(0);

      if (status === 'OPEN') {
        expect(filledQuantity).toBe(0);
      } else if (status === 'FILLED') {
        expect(filledQuantity).toBe(requestedQuantity);
      } else if (status === 'PARTIALLY_FILLED') {
        expect(filledQuantity).toBeGreaterThan(0);
        expect(filledQuantity).toBeLessThan(requestedQuantity);
      } else {
        expect(filledQuantity).toBeLessThan(requestedQuantity);
      }
    }
  });

  it('mantém os preços coerentes com tipo e lado', () => {
    for (const { type, side, price, filledQuantity, averageFillPrice } of orders) {
      if (type === 'MARKET') {
        expect(price).toBeNull();
      } else {
        expect(price).toBeGreaterThan(0);
      }

      if (filledQuantity === 0) {
        expect(averageFillPrice).toBeNull();
        continue;
      }
      expect(averageFillPrice).toBeGreaterThan(0);
      if (type === 'LIMIT' && side === 'BUY') {
        expect(averageFillPrice!).toBeLessThanOrEqual(price!);
      } else if (type === 'LIMIT') {
        expect(averageFillPrice!).toBeGreaterThanOrEqual(price!);
      }
    }
  });

  it('restringe status por tipo de ordem', () => {
    for (const { type, status, validity, createdAt } of orders) {
      if (type === 'MARKET') {
        expect(['FILLED', 'CANCELLED']).toContain(status);
        expect(validity).toBe('DAY');
      }
      if (status === 'OPEN' || status === 'PARTIALLY_FILLED') {
        expect(type).toBe('LIMIT');
        if (validity === 'DAY') {
          expect(createdAt).toBeGreaterThanOrEqual(history.currentSessionStart);
        }
      }
    }
  });

  it('mantém as datas coerentes e separa as fases pelo corte', () => {
    for (const order of orders) {
      expect(order.createdAt).toBeLessThanOrEqual(order.updatedAt);
      expect(order.updatedAt).toBeLessThanOrEqual(START_TIME);
      if (isActive(order)) {
        expect(order.updatedAt).toBeGreaterThanOrEqual(CUTOFF);
      } else {
        expect(order.updatedAt).toBeLessThan(CUTOFF);
      }
    }
  });

  it('usa preços de execução dentro do candle nas ordens encerradas', () => {
    const closedOrders = orders.filter((order) => !isActive(order) && order.filledQuantity > 0);
    for (const { symbol, averageFillPrice, updatedAt } of closedOrders) {
      const minute = Math.floor(updatedAt / 60_000) * 60_000;
      const [candle] = history.query(symbol, 1, minute + 1);
      expect(Math.round(averageFillPrice! * 100)).toBeGreaterThanOrEqual(candle!.low);
      expect(Math.round(averageFillPrice! * 100)).toBeLessThanOrEqual(candle!.high);
    }
  });

  it('é reproduzível pela seed', () => {
    const repeated = setup();
    expect(repeated.orders).toEqual(orders);
    expect(repeated.account.holdings).toEqual(account.holdings);
    expect(repeated.account.availableCents).toBe(account.availableCents);
  });

  it('muda com outra seed', () => {
    expect(setup(43).orders).not.toEqual(orders);
  });

  describe('carteira derivada', () => {
    const held = new Set(account.holdings.map(({ symbol }) => symbol));

    it('reproduz quantidade e preço médio a partir das execuções', () => {
      for (const holding of account.holdings) {
        let quantity = 0;
        let average = 0;
        const fills = orders
          .filter((order) => order.symbol === holding.symbol && order.filledQuantity > 0)
          .sort((a, b) => a.updatedAt - b.updatedAt);

        for (const { side, filledQuantity, averageFillPrice } of fills) {
          if (side === 'SELL') {
            quantity -= filledQuantity;
          } else {
            const fill = Math.round(averageFillPrice! * 100);
            const cost = average * quantity + fill * filledQuantity;
            quantity += filledQuantity;
            average = Math.round(cost / quantity);
          }
        }

        expect(holding.quantity).toBe(quantity);
        expect(holding.quantity).toBeGreaterThan(0);
        expect(holding.averagePrice).toBe(average);
      }
    });

    it('não tem execuções fora da carteira', () => {
      for (const { symbol, filledQuantity } of orders) {
        if (!held.has(symbol)) {
          expect(filledQuantity).toBe(0);
        }
      }
    });

    it('não vende ativos fora da carteira', () => {
      expect(orders.filter(({ symbol, side }) => side === 'SELL' && !held.has(symbol))).toEqual([]);
    });

    it('bloqueia na custódia o restante das vendas abertas', () => {
      for (const holding of account.holdings) {
        const blocked = orders
          .filter((o) => o.symbol === holding.symbol && o.side === 'SELL' && isActive(o))
          .reduce((sum, order) => sum + remaining(order), 0);
        expect(holding.blockedQuantity).toBe(blocked);
        expect(holding.blockedQuantity).toBeLessThanOrEqual(holding.quantity);
      }
    });
  });

  it('bloqueia em saldo o restante das compras abertas', () => {
    const blocked = orders
      .filter((order) => order.side === 'BUY' && isActive(order))
      .reduce((sum, order) => sum + Math.round(order.price! * 100) * remaining(order), 0);
    expect(account.blockedCents).toBe(blocked);
  });
});

describe('OrderLedger.query', () => {
  it('ordena do mais recente para o mais antigo', () => {
    for (let index = 1; index < orders.length; index++) {
      const previous = orders[index - 1]!;
      const current = orders[index]!;
      expect(previous.createdAt).toBeGreaterThanOrEqual(current.createdAt);
      if (previous.createdAt === current.createdAt) {
        expect(previous.id > current.id).toBe(true);
      }
    }
  });

  it('pagina sem repetir nem perder ordens', () => {
    const seen: string[] = [];
    for (let offset = 0; offset < volume.orders; offset += 300) {
      const page = account.ledger.query({ offset, limit: 300 });
      expect(page.total).toBe(volume.orders);
      expect(page.offset).toBe(offset);
      expect(page.limit).toBe(300);
      seen.push(...page.items.map(({ id }) => id));
    }
    expect(seen).toEqual(orders.map(({ id }) => id));
  });

  it.each(ORDER_STATUSES)('filtra pelo status %s', (status) => {
    const page = account.ledger.query({ status, offset: 0, limit: 500 });
    expect(page.total).toBe(orders.filter((order) => order.status === status).length);
    expect(page.items.every((order) => order.status === status)).toBe(true);
  });

  it('filtra por ativo', () => {
    const page = account.ledger.query({ symbol: 'PETR4', offset: 0, limit: 500 });
    expect(page.total).toBe(orders.filter(({ symbol }) => symbol === 'PETR4').length);
    expect(page.items.every(({ symbol }) => symbol === 'PETR4')).toBe(true);
  });

  it('combina os filtros', () => {
    const symbol = account.holdings[0]!.symbol;
    const page = account.ledger.query({ symbol, status: 'FILLED', offset: 0, limit: 500 });
    expect(page.total).toBe(
      orders.filter((order) => order.symbol === symbol && order.status === 'FILLED').length,
    );
    expect(page.total).toBeGreaterThan(0);
  });

  it('devolve lista vazia além do fim', () => {
    const page = account.ledger.query({ offset: volume.orders, limit: 10 });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(volume.orders);
  });
});
