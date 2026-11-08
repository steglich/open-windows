export const CHANNELS = ['quote', 'book', 'positions'] as const;

export type Channel = (typeof CHANNELS)[number];

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

export type ParseResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; code: ErrorCode; message: string };

function failure(code: ErrorCode, message: string): ParseResult {
  return { ok: false, code, message };
}

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

export function parseClientMessage(raw: string, knownSymbols: ReadonlySet<string>): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure('INVALID_MESSAGE', 'A mensagem não é um JSON válido.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return failure('INVALID_MESSAGE', 'A mensagem deve ser um objeto JSON.');
  }

  const { type, channel, symbols } = parsed as Record<string, unknown>;

  if (type !== 'subscribe' && type !== 'unsubscribe') {
    return failure('INVALID_MESSAGE', 'O campo "type" deve ser "subscribe" ou "unsubscribe".');
  }
  if (typeof channel !== 'string') {
    return failure('INVALID_MESSAGE', 'O campo "channel" é obrigatório.');
  }
  if (!isChannel(channel)) {
    return failure('UNKNOWN_CHANNEL', `Canal desconhecido: ${channel}.`);
  }
  if (channel === 'positions' || symbols === undefined) {
    return { ok: true, message: { type, channel } };
  }

  if (!Array.isArray(symbols) || symbols.some((symbol) => typeof symbol !== 'string')) {
    return failure('INVALID_MESSAGE', 'O campo "symbols" deve ser uma lista de códigos.');
  }

  const requested = symbols as string[];
  const unknown = requested.find((symbol) => !knownSymbols.has(symbol));
  if (unknown !== undefined) {
    return failure('UNKNOWN_SYMBOL', `Ativo desconhecido: ${unknown}.`);
  }

  return { ok: true, message: { type, channel, symbols: requested } };
}
