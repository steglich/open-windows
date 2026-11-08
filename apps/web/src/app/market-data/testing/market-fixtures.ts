import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { DEFAULT_CURRENCY_CODE, LOCALE_ID, type Provider } from '@angular/core';

import { ALL_MARKET_FEEDS, type MarketStore } from '../market-store';
import type {
  AccountBalance,
  Candle,
  GetCandlesMessage,
  OrderBook,
  Portfolio,
  Quote,
  ServerMessage,
} from '../market-protocol';
import { FakeWebSocket } from './fake-web-socket';

registerLocaleData(localePt);

export const PT_BR_PROVIDERS: Provider[] = [
  { provide: LOCALE_ID, useValue: 'pt-BR' },
  { provide: DEFAULT_CURRENCY_CODE, useValue: 'BRL' },
];

export const SYMBOLS = ['ALFA3', 'BETA4', 'GAMA3'];

/** Texto do elemento com o espaço não separável da formatação `pt-BR` normalizado. */
export function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\u00a0/g, ' ');
}

export function welcome(symbols: readonly string[] = SYMBOLS): ServerMessage {
  return { type: 'welcome', channels: ['quote', 'book', 'candle', 'positions', 'account'], symbols };
}

export function quote(symbol: string, overrides: Partial<Quote> = {}): Quote {
  return {
    symbol,
    last: 32.5,
    bid: 32.49,
    ask: 32.51,
    open: 32.1,
    high: 33,
    low: 31.9,
    previousClose: 32,
    change: 0.5,
    changePercent: 1.56,
    volume: 1_500_000,
    financialVolume: 48_750_000,
    updatedAt: 1,
    ...overrides,
  };
}

export function quoteMessage(symbol: string, overrides: Partial<Quote> = {}): ServerMessage {
  return { type: 'quotes', timestamp: 1, data: [quote(symbol, overrides)] };
}

export function quotesMessage(quotes: Quote[]): ServerMessage {
  return { type: 'quotes', timestamp: 1, data: quotes };
}

export function book(symbol: string, overrides: Partial<OrderBook> = {}): OrderBook {
  return {
    symbol,
    spread: 0.02,
    bids: [
      { price: 32.49, quantity: 100, orders: 1 },
      { price: 32.48, quantity: 200, orders: 2 },
    ],
    asks: [
      { price: 32.51, quantity: 300, orders: 3 },
      { price: 32.52, quantity: 400, orders: 4 },
    ],
    ...overrides,
  };
}

export function bookMessage(symbol: string, overrides: Partial<OrderBook> = {}): ServerMessage {
  return { type: 'book', timestamp: 1, data: book(symbol, overrides) };
}

export function portfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    accountId: 'SIM-0001',
    totalMarketValue: 1234.5,
    totalUnrealizedPnl: 100,
    totalUnrealizedPnlPercent: 8.82,
    positions: [
      {
        symbol: 'ALFA3',
        quantity: 1000,
        blockedQuantity: 0,
        averagePrice: 31.8,
        lastPrice: 32.5,
        marketValue: 32_500,
        unrealizedPnl: 700,
        unrealizedPnlPercent: 2.2,
      },
      {
        symbol: 'OMEG3',
        quantity: 5000,
        blockedQuantity: 100,
        averagePrice: 12.95,
        lastPrice: 12.4,
        marketValue: 62_000,
        unrealizedPnl: -2750,
        unrealizedPnlPercent: -4.25,
      },
    ],
    ...overrides,
  };
}

export function positionsMessage(overrides: Partial<Portfolio> = {}): ServerMessage {
  return { type: 'positions', timestamp: 1, data: portfolio(overrides) };
}

export function account(overrides: Partial<AccountBalance> = {}): AccountBalance {
  return {
    accountId: 'SIM-0001',
    availableBalance: 300,
    blockedBalance: 200,
    totalEquity: 1000,
    ...overrides,
  };
}

export function accountMessage(overrides: Partial<AccountBalance> = {}): ServerMessage {
  return { type: 'account', timestamp: 1, data: account(overrides) };
}

export function candle(time: number, overrides: Partial<Candle> = {}): Candle {
  return {
    time,
    open: 32,
    high: 33,
    low: 31.5,
    close: 32.5,
    volume: 1000,
    financialVolume: 32_500,
    ...overrides,
  };
}

export function candlesMessage(
  requestId: string,
  symbol: string,
  candles: Candle[],
): ServerMessage {
  return {
    type: 'candles',
    requestId,
    timestamp: 1,
    data: { symbol, interval: '1m', candles },
  };
}

export function candleMessage(symbol: string, value: Candle): ServerMessage {
  return { type: 'candle', timestamp: 1, data: { symbol, interval: '1m', candle: value } };
}

/** Consultas de candles enviadas pela conexão falsa, da mais antiga para a mais recente. */
export function candleRequests(socket: FakeWebSocket): GetCandlesMessage[] {
  return socket.sent.filter((message) => message.type === 'getCandles');
}

/** Responde à consulta de candles mais recente enviada pela conexão falsa. */
export function answerCandles(socket: FakeWebSocket, candles: Candle[]): void {
  const request = candleRequests(socket).at(-1) as GetCandlesMessage;
  socket.receive(candlesMessage(request.requestId, request.symbol, candles));
}

/** Inicia o store usando todos os dados e leva a conexão falsa até o `welcome`. */
export function startConnected(
  store: MarketStore,
  symbols: readonly string[] = SYMBOLS,
): FakeWebSocket {
  store.setFeeds(ALL_MARKET_FEEDS);
  store.start();
  const socket = FakeWebSocket.last;
  socket.open();
  socket.receive(welcome(symbols));
  return socket;
}
