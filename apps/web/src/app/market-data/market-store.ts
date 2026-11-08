import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MarketSocket } from './market-socket';
import type {
  AccountBalance,
  Candle,
  ErrorCode,
  OrderBook,
  Portfolio,
  Quote,
  ServerMessage,
} from './market-protocol';

export interface MarketError {
  code: ErrorCode;
  message: string;
}

const CANDLE_LIMIT = 120;
const MINUTE_MS = 60_000;

/** Estado em tempo real do mercado. Os componentes apenas leem estes signals. */
@Injectable({ providedIn: 'root' })
export class MarketStore {
  private readonly socket = inject(MarketSocket);

  private readonly quotes = signal<Readonly<Record<string, Quote>>>({});
  private readonly symbolsState = signal<readonly string[]>([]);
  private readonly selectedSymbolState = signal<string | null>(null);
  private readonly bookState = signal<OrderBook | null>(null);
  private readonly portfolioState = signal<Portfolio | null>(null);
  private readonly accountState = signal<AccountBalance | null>(null);
  private readonly candlesState = signal<readonly Candle[] | null>(null);
  private readonly lastErrorState = signal<MarketError | null>(null);

  private candlesRequestCount = 0;
  private pendingCandlesRequestId: string | null = null;

  readonly status = this.socket.status;
  readonly symbols = this.symbolsState.asReadonly();
  readonly selectedSymbol = this.selectedSymbolState.asReadonly();
  readonly book = this.bookState.asReadonly();
  readonly portfolio = this.portfolioState.asReadonly();
  readonly account = this.accountState.asReadonly();
  readonly candles = this.candlesState.asReadonly();
  readonly lastError = this.lastErrorState.asReadonly();

  readonly stale = computed(() => this.status() !== 'connected');
  readonly quoteRows = computed(() => {
    const quotes = this.quotes();
    return this.symbols().flatMap((symbol) => quotes[symbol] ?? []);
  });
  readonly selectedQuote = computed(() => {
    const symbol = this.selectedSymbol();
    return symbol === null ? null : (this.quotes()[symbol] ?? null);
  });

  constructor() {
    this.socket.messages
      .pipe(takeUntilDestroyed())
      .subscribe((message) => this.applyMessage(message));
  }

  start(): void {
    this.socket.connect();
  }

  select(symbol: string): void {
    const previous = this.selectedSymbolState();
    if (symbol === previous) {
      return;
    }
    this.selectedSymbolState.set(symbol);
    this.clearSelectionData();
    if (this.status() !== 'connected') {
      return;
    }
    if (previous !== null) {
      this.socket.send({ type: 'unsubscribe', channel: 'book', symbols: [previous] });
    }
    this.socket.send({ type: 'subscribe', channel: 'book', symbols: [symbol] });
    this.requestCandles(symbol);
  }

  private clearSelectionData(): void {
    this.bookState.set(null);
    this.candlesState.set(null);
    this.pendingCandlesRequestId = null;
  }

  private requestCandles(symbol: string): void {
    const requestId = `candles-${++this.candlesRequestCount}`;
    this.pendingCandlesRequestId = requestId;
    this.socket.send({ type: 'getCandles', requestId, symbol, limit: CANDLE_LIMIT });
  }

  private applyMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.lastErrorState.set(null);
        this.applyWelcome(message.symbols);
        break;
      case 'subscribed':
        this.lastErrorState.set(null);
        break;
      case 'unsubscribed':
        break;
      case 'error':
        this.lastErrorState.set({ code: message.code, message: message.message });
        if (message.requestId === this.pendingCandlesRequestId) {
          this.pendingCandlesRequestId = null;
        }
        break;
      case 'quotes':
        this.applyQuotes(message.data);
        break;
      case 'book':
        if (message.data.symbol === this.selectedSymbolState()) {
          this.bookState.set(message.data);
        }
        break;
      case 'positions':
        this.portfolioState.set(message.data);
        break;
      case 'account':
        this.accountState.set(message.data);
        break;
      case 'candles':
        if (message.requestId === this.pendingCandlesRequestId) {
          this.pendingCandlesRequestId = null;
          this.candlesState.set(message.data.candles);
        }
        break;
      case 'orders':
        // Ainda não exibidos na tela.
        break;
    }
  }

  /** Aplica o lote em uma única atualização, já que ele pode trazer centenas de ativos. */
  private applyQuotes(batch: readonly Quote[]): void {
    this.quotes.update((quotes) => {
      const updated = { ...quotes };
      for (const quote of batch) {
        updated[quote.symbol] = quote;
      }
      return updated;
    });

    const selected = this.selectedSymbolState();
    const quote = batch.find(({ symbol }) => symbol === selected);
    if (quote !== undefined) {
      this.applyQuoteToCandles(quote);
    }
  }

  /** O servidor fecha o candle pelo mesmo relógio de `updatedAt`, então os minutos coincidem. */
  private applyQuoteToCandles(quote: Quote): void {
    const candles = this.candlesState();
    const current = candles?.at(-1);
    if (candles === null || current === undefined) {
      return;
    }

    const minute = Math.floor(quote.updatedAt / MINUTE_MS) * MINUTE_MS;
    if (minute > current.time) {
      if (this.pendingCandlesRequestId === null) {
        this.requestCandles(quote.symbol);
      }
      return;
    }
    if (minute < current.time) {
      return;
    }

    const high = Math.max(current.high, quote.last);
    const low = Math.min(current.low, quote.last);
    if (quote.last !== current.close || high !== current.high || low !== current.low) {
      this.candlesState.set([...candles.slice(0, -1), { ...current, close: quote.last, high, low }]);
    }
  }

  /** Assinaturas valem por conexão, então cada `welcome` as refaz. */
  private applyWelcome(symbols: readonly string[]): void {
    this.symbolsState.set(symbols);

    const current = this.selectedSymbolState();
    const selected = current !== null && symbols.includes(current) ? current : (symbols[0] ?? null);
    if (selected !== current) {
      this.selectedSymbolState.set(selected);
      this.clearSelectionData();
    }

    this.socket.send({ type: 'subscribe', channel: 'quote' });
    this.socket.send({ type: 'subscribe', channel: 'positions' });
    this.socket.send({ type: 'subscribe', channel: 'account' });
    if (selected !== null) {
      this.socket.send({ type: 'subscribe', channel: 'book', symbols: [selected] });
      this.requestCandles(selected);
    }
  }
}
