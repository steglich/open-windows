import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { DEFAULT_CURRENCY_CODE, LOCALE_ID, type Provider } from '@angular/core';

import type { MarketStore } from '../market-store';
import type { OrderBook, Portfolio, Quote, ServerMessage } from '../market-protocol';
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
  return { type: 'welcome', channels: ['quote', 'book', 'positions'], symbols };
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
    ...overrides,
  };
}

export function quoteMessage(symbol: string, overrides: Partial<Quote> = {}): ServerMessage {
  return { type: 'quote', timestamp: 1, data: quote(symbol, overrides) };
}

export function book(symbol: string, overrides: Partial<OrderBook> = {}): OrderBook {
  return {
    symbol,
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
    positions: [
      {
        symbol: 'ALFA3',
        quantity: 1000,
        averagePrice: 31.8,
        lastPrice: 32.5,
        marketValue: 32_500,
        unrealizedPnl: 700,
        unrealizedPnlPercent: 2.2,
      },
      {
        symbol: 'OMEG3',
        quantity: 5000,
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

/** Inicia o store e leva a conexão falsa até o `welcome`. */
export function startConnected(
  store: MarketStore,
  symbols: readonly string[] = SYMBOLS,
): FakeWebSocket {
  store.start();
  const socket = FakeWebSocket.last;
  socket.open();
  socket.receive(welcome(symbols));
  return socket;
}
