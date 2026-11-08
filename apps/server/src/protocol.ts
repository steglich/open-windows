export const CHANNELS = ['quote', 'book', 'positions', 'account'] as const;

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

export const ORDER_STATUSES = ['OPEN', 'FILLED', 'CANCELLED', 'PARTIALLY_FILLED'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
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

export const DEFAULT_CANDLES_LIMIT = 390;
export const MAX_CANDLES_LIMIT = 3_000;
export const DEFAULT_ORDERS_LIMIT = 100;
export const MAX_ORDERS_LIMIT = 500;

export type ParseResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; code: ErrorCode; message: string; requestId?: string };

function failure(code: ErrorCode, message: string, requestId?: string): ParseResult {
  return { ok: false, code, message, requestId };
}

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return (ORDER_STATUSES as readonly unknown[]).includes(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function parseSubscription(
  type: SubscriptionMessage['type'],
  { channel, symbols }: Record<string, unknown>,
  knownSymbols: ReadonlySet<string>,
): ParseResult {
  if (typeof channel !== 'string') {
    return failure('INVALID_MESSAGE', 'O campo "channel" é obrigatório.');
  }
  if (!isChannel(channel)) {
    return failure('UNKNOWN_CHANNEL', `Canal desconhecido: ${channel}.`);
  }
  if (channel === 'positions' || channel === 'account' || symbols === undefined) {
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

function parseGetCandles(
  requestId: string,
  { symbol, limit = DEFAULT_CANDLES_LIMIT, before }: Record<string, unknown>,
  knownSymbols: ReadonlySet<string>,
): ParseResult {
  if (typeof symbol !== 'string') {
    return failure('INVALID_MESSAGE', 'O campo "symbol" é obrigatório.', requestId);
  }
  if (!knownSymbols.has(symbol)) {
    return failure('UNKNOWN_SYMBOL', `Ativo desconhecido: ${symbol}.`, requestId);
  }
  if (!isIntegerInRange(limit, 1, MAX_CANDLES_LIMIT)) {
    return failure(
      'INVALID_MESSAGE',
      `O campo "limit" deve ser um inteiro entre 1 e ${MAX_CANDLES_LIMIT}.`,
      requestId,
    );
  }
  if (before !== undefined && !Number.isFinite(before)) {
    return failure('INVALID_MESSAGE', 'O campo "before" deve ser um número.', requestId);
  }

  return {
    ok: true,
    message: { type: 'getCandles', requestId, symbol, limit, before: before as number | undefined },
  };
}

function parseGetOrders(
  requestId: string,
  { status, symbol, offset = 0, limit = DEFAULT_ORDERS_LIMIT }: Record<string, unknown>,
  knownSymbols: ReadonlySet<string>,
): ParseResult {
  if (status !== undefined && !isOrderStatus(status)) {
    return failure('INVALID_MESSAGE', 'O campo "status" é inválido.', requestId);
  }
  if (symbol !== undefined && typeof symbol !== 'string') {
    return failure('INVALID_MESSAGE', 'O campo "symbol" deve ser um código.', requestId);
  }
  if (symbol !== undefined && !knownSymbols.has(symbol as string)) {
    return failure('UNKNOWN_SYMBOL', `Ativo desconhecido: ${symbol as string}.`, requestId);
  }
  if (!isIntegerInRange(offset, 0, Number.MAX_SAFE_INTEGER)) {
    return failure('INVALID_MESSAGE', 'O campo "offset" deve ser um inteiro positivo.', requestId);
  }
  if (!isIntegerInRange(limit, 1, MAX_ORDERS_LIMIT)) {
    return failure(
      'INVALID_MESSAGE',
      `O campo "limit" deve ser um inteiro entre 1 e ${MAX_ORDERS_LIMIT}.`,
      requestId,
    );
  }

  return {
    ok: true,
    message: {
      type: 'getOrders',
      requestId,
      status,
      symbol: symbol as string | undefined,
      offset,
      limit,
    },
  };
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

  const fields = parsed as Record<string, unknown>;
  const { type, requestId } = fields;

  if (type === 'subscribe' || type === 'unsubscribe') {
    return parseSubscription(type, fields, knownSymbols);
  }
  if (type !== 'getCandles' && type !== 'getOrders') {
    return failure('INVALID_MESSAGE', `Tipo de mensagem desconhecido: ${String(type)}.`);
  }
  if (typeof requestId !== 'string' || requestId === '') {
    return failure('INVALID_MESSAGE', 'O campo "requestId" é obrigatório.');
  }

  return type === 'getCandles'
    ? parseGetCandles(requestId, fields, knownSymbols)
    : parseGetOrders(requestId, fields, knownSymbols);
}
