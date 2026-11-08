import type {
  Order,
  OrderPage,
  OrderSide,
  OrderStatus,
  OrderType,
  OrderValidity,
} from '../protocol.js';
import { LOT_SIZE, MINUTE_MS, type PriceHistory } from './history.js';
import { deriveSeed, randomInt, seededRandom, shuffle, type RandomSource } from './random.js';
import { centsToReais } from './simulator.js';
import type { SimulationVolume } from './volume.js';

/** Posição em custódia, com preço médio em centavos. */
export interface Holding {
  symbol: string;
  quantity: number;
  blockedQuantity: number;
  averagePrice: number;
}

export interface GeneratedAccount {
  ledger: OrderLedger;
  /** Na ordem do catálogo. */
  holdings: Holding[];
  availableCents: number;
  blockedCents: number;
}

export interface GenerateAccountOptions {
  history: PriceHistory;
  symbols: readonly string[];
  seed: number;
  volume: SimulationVolume;
  startTime: number;
}

export interface OrderQuery {
  status?: OrderStatus;
  symbol?: string;
  offset: number;
  limit: number;
}

/** Igual a `Order`, com `price` e `averageFillPrice` em centavos. */
type OrderCents = Omit<Order, 'id'>;

const CUTOFF_MS = 30 * MINUTE_MS;
const OPEN_SHARE = 0.1;
const PARTIALLY_FILLED_SHARE = 0.05;
const CANCELLED_SHARE = 0.25;
const MAX_ORDER_LOTS = 20;
const BUY_PROBABILITY = 0.55;
const MARKET_PROBABILITY = 0.3;
const PARTIAL_CANCEL_PROBABILITY = 0.3;
const MAX_LIMIT_OFFSET = 0.01;
const MIN_OPEN_DISTANCE = 0.005;
const MAX_OPEN_DISTANCE = 0.05;
const MAX_FILL_IMPROVEMENT = 0.005;
const MIN_AVAILABLE_CENTS = 5_000_000;
const MAX_AVAILABLE_CENTS = 50_000_000;

function toReais(order: Order): Order {
  return {
    ...order,
    price: order.price === null ? null : centsToReais(order.price),
    averageFillPrice:
      order.averageFillPrice === null ? null : centsToReais(order.averageFillPrice),
  };
}

function groupBy<K>(orders: readonly Order[], key: (order: Order) => K): Map<K, Order[]> {
  const groups = new Map<K, Order[]>();
  for (const order of orders) {
    const group = groups.get(key(order));
    if (group) {
      group.push(order);
    } else {
      groups.set(key(order), [order]);
    }
  }
  return groups;
}

/** Ordens em ordem decrescente de `createdAt`, com índices para evitar varrer tudo a cada consulta. */
export class OrderLedger {
  private readonly byStatus: ReadonlyMap<OrderStatus, Order[]>;
  private readonly bySymbol: ReadonlyMap<string, Order[]>;

  constructor(private readonly orders: readonly Order[]) {
    this.byStatus = groupBy(orders, ({ status }) => status);
    this.bySymbol = groupBy(orders, ({ symbol }) => symbol);
  }

  query({ status, symbol, offset, limit }: OrderQuery): OrderPage {
    const matching = this.select(status, symbol);
    return {
      items: matching.slice(offset, offset + limit).map(toReais),
      total: matching.length,
      offset,
      limit,
    };
  }

  private select(status?: OrderStatus, symbol?: string): readonly Order[] {
    if (symbol !== undefined) {
      const orders = this.bySymbol.get(symbol) ?? [];
      return status === undefined ? orders : orders.filter((order) => order.status === status);
    }
    return status === undefined ? this.orders : (this.byStatus.get(status) ?? []);
  }
}

/** Primeira ou segunda fase: um instante e o candle usado para precificar a ordem. */
interface Slot {
  index: number;
  updatedAt: number;
}

class AccountGenerator {
  private readonly random: RandomSource;
  private readonly history: PriceHistory;
  private readonly symbols: readonly string[];
  private readonly volume: SimulationVolume;
  private readonly startTime: number;
  private readonly cutoff: number;
  private readonly reference: string;
  private readonly held: string[];
  private readonly holdings: Map<string, Holding>;
  private readonly drafts: OrderCents[] = [];
  private blockedCents = 0;

  constructor({ history, symbols, seed, volume, startTime }: GenerateAccountOptions) {
    this.random = seededRandom(deriveSeed(seed, 'orders'));
    this.history = history;
    this.symbols = symbols;
    this.volume = volume;
    this.startTime = startTime;
    this.cutoff = startTime - CUTOFF_MS;
    this.reference = symbols[0]!;
    this.held = shuffle(this.random, [...symbols]).slice(0, volume.positions);
    this.holdings = new Map(
      this.held.map((symbol) => [
        symbol,
        { symbol, quantity: 0, blockedQuantity: 0, averagePrice: 0 },
      ]),
    );
  }

  generate(): GeneratedAccount {
    const openCount = Math.floor(this.volume.orders * OPEN_SHARE);
    const partialCount = Math.floor(this.volume.orders * PARTIALLY_FILLED_SHARE);
    const cancelledCount = Math.floor(this.volume.orders * CANCELLED_SHARE);
    const filledCount = this.volume.orders - openCount - partialCount - cancelledCount;

    this.generateClosedOrders(filledCount, cancelledCount);
    this.generateActiveOrders(openCount, partialCount);

    return {
      ledger: new OrderLedger(this.finalizeOrders()),
      holdings: this.symbols.flatMap((symbol) => this.holdings.get(symbol) ?? []),
      availableCents: randomInt(this.random, MIN_AVAILABLE_CENTS, MAX_AVAILABLE_CENTS),
      blockedCents: this.blockedCents,
    };
  }

  /** Atribui IDs em ordem cronológica e devolve da ordem mais recente para a mais antiga. */
  private finalizeOrders(): Order[] {
    return this.drafts
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((order, index) => ({ id: `ORD-${String(index + 1).padStart(6, '0')}`, ...order }))
      .reverse();
  }

  /** Slots em ordem cronológica, para que as execuções sejam aplicadas à carteira nessa ordem. */
  private drawSlots(count: number, firstIndex: number, lastIndex: number): Slot[] {
    const slots: Slot[] = [];
    for (let drawn = 0; drawn < count; drawn++) {
      const index = randomInt(this.random, firstIndex, lastIndex);
      const offset = randomInt(this.random, 0, MINUTE_MS - 1);
      const updatedAt = Math.min(this.startTime, this.history.timeAt(this.reference, index) + offset);
      slots.push({ index, updatedAt });
    }
    return slots.sort((a, b) => a.updatedAt - b.updatedAt);
  }

  private generateClosedOrders(filledCount: number, cancelledCount: number): void {
    const size = this.history.size(this.reference);
    let lastClosedIndex = size - 1;
    while (this.history.timeAt(this.reference, lastClosedIndex) + MINUTE_MS > this.cutoff) {
      lastClosedIndex--;
    }

    const forced = this.held.length;
    const statuses = shuffle(this.random, [
      ...Array<OrderStatus>(filledCount - forced).fill('FILLED'),
      ...Array<OrderStatus>(cancelledCount).fill('CANCELLED'),
    ]);

    this.drawSlots(filledCount + cancelledCount, 0, lastClosedIndex).forEach((slot, position) => {
      if (position < forced) {
        this.addFilledOrder(slot, this.held[position]!, 'BUY');
      } else if (statuses[position - forced] === 'FILLED') {
        this.addFilledOrder(slot, this.pickHeld(), this.pickSide());
      } else {
        this.addCancelledOrder(slot);
      }
    });
  }

  private generateActiveOrders(openCount: number, partialCount: number): void {
    const lastIndex = this.history.size(this.reference) - 1;
    let firstIndex = lastIndex;
    while (this.history.timeAt(this.reference, firstIndex - 1) >= this.cutoff) {
      firstIndex--;
    }

    const statuses = shuffle(this.random, [
      ...Array<OrderStatus>(openCount).fill('OPEN'),
      ...Array<OrderStatus>(partialCount).fill('PARTIALLY_FILLED'),
    ]);

    this.drawSlots(openCount + partialCount, firstIndex, lastIndex).forEach((slot, position) => {
      if (statuses[position] === 'OPEN') {
        this.addOpenOrder(slot);
      } else {
        this.addPartialOrder(slot);
      }
    });
  }

  private addFilledOrder({ index, updatedAt }: Slot, symbol: string, requestedSide: OrderSide): void {
    const holding = this.holdings.get(symbol)!;
    const type = this.pickType();
    let side = requestedSide;
    let lots = randomInt(this.random, 1, MAX_ORDER_LOTS);

    if (side === 'SELL') {
      const sellable = this.sellableLots(holding);
      if (sellable < 1) {
        side = 'BUY';
      } else {
        lots = Math.min(lots, sellable);
      }
    }

    const fillPrice = this.drawFillPrice(symbol, index);
    const quantity = lots * LOT_SIZE;
    this.applyFill(holding, side, quantity, fillPrice);
    this.drafts.push({
      symbol,
      side,
      type,
      validity: this.pickValidity(type),
      price: type === 'MARKET' ? null : this.limitForFill(side, fillPrice),
      requestedQuantity: quantity,
      filledQuantity: quantity,
      averageFillPrice: fillPrice,
      status: 'FILLED',
      createdAt: this.closedCreatedAt(updatedAt),
      updatedAt,
    });
  }

  private addCancelledOrder({ index, updatedAt }: Slot): void {
    const symbol = this.symbols[randomInt(this.random, 0, this.symbols.length - 1)]!;
    const holding = this.holdings.get(symbol);
    const side: OrderSide = holding ? this.pickSide() : 'BUY';
    const type = this.pickType();
    const lots = randomInt(this.random, 1, MAX_ORDER_LOTS);
    const fillPrice = this.drawFillPrice(symbol, index);

    let filledLots = 0;
    if (holding && type === 'LIMIT' && lots > 1 && this.random() < PARTIAL_CANCEL_PROBABILITY) {
      filledLots = randomInt(this.random, 1, lots - 1);
      if (side === 'SELL') {
        filledLots = Math.min(filledLots, this.sellableLots(holding));
      }
    }

    if (holding && filledLots > 0) {
      this.applyFill(holding, side, filledLots * LOT_SIZE, fillPrice);
    }
    this.drafts.push({
      symbol,
      side,
      type,
      validity: this.pickValidity(type),
      price: type === 'MARKET' ? null : this.limitForFill(side, fillPrice),
      requestedQuantity: lots * LOT_SIZE,
      filledQuantity: filledLots * LOT_SIZE,
      averageFillPrice: filledLots > 0 ? fillPrice : null,
      status: 'CANCELLED',
      createdAt: this.closedCreatedAt(updatedAt),
      updatedAt,
    });
  }

  private addOpenOrder(slot: Slot): void {
    const symbol = this.symbols[randomInt(this.random, 0, this.symbols.length - 1)]!;
    const holding = this.holdings.get(symbol);
    let side: OrderSide = holding ? this.pickSide() : 'BUY';
    let lots = randomInt(this.random, 1, MAX_ORDER_LOTS);

    if (side === 'SELL') {
      const free = this.freeLots(holding!);
      if (free < 1) {
        side = 'BUY';
      } else {
        lots = Math.min(lots, free);
      }
    }

    const price = this.drawRestingPrice(symbol, side);
    this.reserve(holding, side, lots * LOT_SIZE, price);
    this.drafts.push(this.activeDraft(slot, symbol, side, price, lots * LOT_SIZE, 0, null, 'OPEN'));
  }

  private addPartialOrder(slot: Slot): void {
    const symbol = this.pickHeld();
    const holding = this.holdings.get(symbol)!;
    let side = this.pickSide();
    let lots = randomInt(this.random, 2, MAX_ORDER_LOTS);

    if (side === 'SELL') {
      const free = this.freeLots(holding);
      if (free < 2) {
        side = 'BUY';
      } else {
        lots = Math.min(lots, free);
      }
    }

    const filledLots = randomInt(this.random, 1, lots - 1);
    const price = this.drawRestingPrice(symbol, side);
    const fillPrice = this.improveOnLimit(side, price);
    this.applyFill(holding, side, filledLots * LOT_SIZE, fillPrice);
    this.reserve(holding, side, (lots - filledLots) * LOT_SIZE, price);
    this.drafts.push(
      this.activeDraft(
        slot,
        symbol,
        side,
        price,
        lots * LOT_SIZE,
        filledLots * LOT_SIZE,
        fillPrice,
        'PARTIALLY_FILLED',
      ),
    );
  }

  private activeDraft(
    { index, updatedAt }: Slot,
    symbol: string,
    side: OrderSide,
    price: number,
    requestedQuantity: number,
    filledQuantity: number,
    averageFillPrice: number | null,
    status: OrderStatus,
  ): OrderCents {
    const validity: OrderValidity = this.random() < 0.5 ? 'DAY' : 'GTC';
    return {
      symbol,
      side,
      type: 'LIMIT',
      validity,
      price,
      requestedQuantity,
      filledQuantity,
      averageFillPrice,
      status,
      createdAt: this.activeCreatedAt(validity, index, updatedAt),
      updatedAt,
    };
  }

  /** Ordens de compra bloqueiam saldo. As de venda bloqueiam ações em custódia. */
  private reserve(
    holding: Holding | undefined,
    side: OrderSide,
    remaining: number,
    price: number,
  ): void {
    if (side === 'BUY') {
      this.blockedCents += remaining * price;
    } else {
      holding!.blockedQuantity += remaining;
    }
  }

  private applyFill(holding: Holding, side: OrderSide, quantity: number, price: number): void {
    if (side === 'SELL') {
      holding.quantity -= quantity;
      return;
    }
    const cost = holding.averagePrice * holding.quantity + price * quantity;
    holding.quantity += quantity;
    holding.averagePrice = Math.round(cost / holding.quantity);
  }

  /** Lotes vendíveis deixando ao menos um em custódia, para que a posição continue existindo. */
  private sellableLots(holding: Holding): number {
    return Math.floor(holding.quantity / LOT_SIZE) - 1;
  }

  private freeLots(holding: Holding): number {
    return Math.floor((holding.quantity - holding.blockedQuantity) / LOT_SIZE);
  }

  private pickHeld(): string {
    return this.held[randomInt(this.random, 0, this.held.length - 1)]!;
  }

  private pickSide(): OrderSide {
    return this.random() < BUY_PROBABILITY ? 'BUY' : 'SELL';
  }

  private pickType(): OrderType {
    return this.random() < MARKET_PROBABILITY ? 'MARKET' : 'LIMIT';
  }

  private pickValidity(type: OrderType): OrderValidity {
    return type === 'MARKET' || this.random() < 0.5 ? 'DAY' : 'GTC';
  }

  private drawFillPrice(symbol: string, index: number): number {
    const { low, high } = this.history.candleAt(symbol, index);
    return randomInt(this.random, low, high);
  }

  private limitForFill(side: OrderSide, fillPrice: number): number {
    const offset = randomInt(this.random, 0, Math.ceil(fillPrice * MAX_LIMIT_OFFSET));
    return side === 'BUY' ? fillPrice + offset : Math.max(1, fillPrice - offset);
  }

  /** Preço de uma ordem em repouso, afastado do último preço para não cruzar o book. */
  private drawRestingPrice(symbol: string, side: OrderSide): number {
    const last = this.history.currentCandles(symbol).at(-1)!.close;
    const distance = MIN_OPEN_DISTANCE + this.random() * (MAX_OPEN_DISTANCE - MIN_OPEN_DISTANCE);
    return Math.round(last * (side === 'BUY' ? 1 - distance : 1 + distance));
  }

  private improveOnLimit(side: OrderSide, limit: number): number {
    const improvement = randomInt(this.random, 0, Math.ceil(limit * MAX_FILL_IMPROVEMENT));
    return side === 'BUY' ? Math.max(1, limit - improvement) : limit + improvement;
  }

  private closedCreatedAt(updatedAt: number): number {
    return updatedAt - randomInt(this.random, 0, CUTOFF_MS);
  }

  /** `DAY` nasce no pregão corrente. `GTC` pode ter sido criada em qualquer ponto do histórico. */
  private activeCreatedAt(validity: OrderValidity, index: number, updatedAt: number): number {
    if (validity === 'DAY') {
      return randomInt(this.random, this.history.currentSessionStart, updatedAt);
    }
    const origin = this.history.timeAt(this.reference, randomInt(this.random, 0, index));
    return Math.min(updatedAt, origin + randomInt(this.random, 0, MINUTE_MS - 1));
  }
}

export function generateAccount(options: GenerateAccountOptions): GeneratedAccount {
  return new AccountGenerator(options).generate();
}
