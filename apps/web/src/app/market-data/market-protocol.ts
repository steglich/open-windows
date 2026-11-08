// Cópia dos tipos de apps/server/src/protocol.ts. Mantenha os dois arquivos alinhados.

export type Channel = 'quote' | 'book' | 'positions';

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
  volume: number;
}

export interface BookLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface OrderBook {
  symbol: string;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface Position {
  symbol: string;
  quantity: number;
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
  positions: Position[];
}

export type ErrorCode = 'INVALID_MESSAGE' | 'UNKNOWN_CHANNEL' | 'UNKNOWN_SYMBOL';

export type ServerMessage =
  | { type: 'welcome'; channels: readonly Channel[]; symbols: readonly string[] }
  | { type: 'subscribed' | 'unsubscribed'; channel: Channel; symbols: readonly string[] }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'quote'; timestamp: number; data: Quote }
  | { type: 'book'; timestamp: number; data: OrderBook }
  | { type: 'positions'; timestamp: number; data: Portfolio };

export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe';
  channel: Channel;
  /** Ausente significa todos os ativos. Sempre ausente no canal `positions`. */
  symbols?: string[];
}
