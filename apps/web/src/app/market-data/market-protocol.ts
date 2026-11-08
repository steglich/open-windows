// Cópia dos tipos de apps/server/src/protocol.ts. Mantenha os dois arquivos alinhados.

export type Channel = 'quote' | 'book' | 'candle' | 'positions' | 'account';

export interface Quote {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  /** Quantidade de ações negociadas no pregão. */
  volume: number;
  /** Valor negociado no pregão, em reais. */
  financialVolume: number;
  updatedAt: number;
}

export interface BookLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface OrderBook {
  symbol: string;
  spread: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface Position {
  symbol: string;
  quantity: number;
  /** Quantidade reservada por ordens de venda abertas. */
  blockedQuantity: number;
  averagePrice: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

export interface Portfolio {
  accountId: string;
  totalMarketValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPercent: number;
  positions: Position[];
}

export interface AccountBalance {
  accountId: string;
  availableBalance: number;
  /** Valor restante das ordens de compra abertas e parcialmente executadas. */
  blockedBalance: number;
  totalEquity: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  financialVolume: number;
}

export type OrderStatus = 'OPEN' | 'FILLED' | 'CANCELLED' | 'PARTIALLY_FILLED';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderValidity = 'DAY' | 'GTC';

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  validity: OrderValidity;
  /** `null` em ordens a mercado. */
  price: number | null;
  requestedQuantity: number;
  filledQuantity: number;
  /** `null` enquanto nada foi executado. */
  averageFillPrice: number | null;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}

export interface OrderPage {
  items: Order[];
  total: number;
  offset: number;
  limit: number;
}

export type ErrorCode = 'INVALID_MESSAGE' | 'UNKNOWN_CHANNEL' | 'UNKNOWN_SYMBOL';

export type ServerMessage =
  | { type: 'welcome'; channels: readonly Channel[]; symbols: readonly string[] }
  | { type: 'subscribed' | 'unsubscribed'; channel: Channel; symbols: readonly string[] }
  | { type: 'error'; code: ErrorCode; message: string; requestId?: string }
  | { type: 'quotes'; timestamp: number; data: Quote[] }
  | { type: 'book'; timestamp: number; data: OrderBook }
  | { type: 'candle'; timestamp: number; data: { symbol: string; interval: '1m'; candle: Candle } }
  | { type: 'positions'; timestamp: number; data: Portfolio }
  | { type: 'account'; timestamp: number; data: AccountBalance }
  | {
      type: 'candles';
      requestId: string;
      timestamp: number;
      data: { symbol: string; interval: '1m'; candles: Candle[] };
    }
  | { type: 'orders'; requestId: string; timestamp: number; data: OrderPage };

export interface SubscriptionMessage {
  type: 'subscribe' | 'unsubscribe';
  channel: Channel;
  /** Ausente significa todos os ativos. Sempre ausente nos canais `positions` e `account`. */
  symbols?: string[];
}

export interface GetCandlesMessage {
  type: 'getCandles';
  requestId: string;
  symbol: string;
  limit: number;
  before?: number;
}

export interface GetOrdersMessage {
  type: 'getOrders';
  requestId: string;
  status?: OrderStatus;
  symbol?: string;
  offset: number;
  limit: number;
}

export type ClientMessage = SubscriptionMessage | GetCandlesMessage | GetOrdersMessage;
