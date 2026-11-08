import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MarketSocket } from './market-socket';
import type { ErrorCode, OrderBook, Portfolio, Quote, ServerMessage } from './market-protocol';

export interface MarketError {
  code: ErrorCode;
  message: string;
}

/** Estado em tempo real do mercado. Os componentes apenas leem estes signals. */
@Injectable({ providedIn: 'root' })
export class MarketStore {
  private readonly socket = inject(MarketSocket);

  private readonly quotes = signal<Readonly<Record<string, Quote>>>({});
  private readonly symbolsState = signal<readonly string[]>([]);
  private readonly selectedSymbolState = signal<string | null>(null);
  private readonly bookState = signal<OrderBook | null>(null);
  private readonly portfolioState = signal<Portfolio | null>(null);
  private readonly lastErrorState = signal<MarketError | null>(null);

  readonly status = this.socket.status;
  readonly symbols = this.symbolsState.asReadonly();
  readonly selectedSymbol = this.selectedSymbolState.asReadonly();
  readonly book = this.bookState.asReadonly();
  readonly portfolio = this.portfolioState.asReadonly();
  readonly lastError = this.lastErrorState.asReadonly();

  readonly stale = computed(() => this.status() !== 'connected');
  readonly quoteRows = computed(() => {
    const quotes = this.quotes();
    return this.symbols().flatMap((symbol) => quotes[symbol] ?? []);
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
    this.bookState.set(null);
    if (this.status() !== 'connected') {
      return;
    }
    if (previous !== null) {
      this.socket.send({ type: 'unsubscribe', channel: 'book', symbols: [previous] });
    }
    this.socket.send({ type: 'subscribe', channel: 'book', symbols: [symbol] });
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
        break;
      case 'quote':
        this.quotes.update((quotes) => ({ ...quotes, [message.data.symbol]: message.data }));
        break;
      case 'book':
        if (message.data.symbol === this.selectedSymbolState()) {
          this.bookState.set(message.data);
        }
        break;
      case 'positions':
        this.portfolioState.set(message.data);
        break;
    }
  }

  /** Assinaturas valem por conexão, então cada `welcome` as refaz. */
  private applyWelcome(symbols: readonly string[]): void {
    this.symbolsState.set(symbols);

    const current = this.selectedSymbolState();
    const selected = current !== null && symbols.includes(current) ? current : (symbols[0] ?? null);
    if (selected !== current) {
      this.selectedSymbolState.set(selected);
      this.bookState.set(null);
    }

    this.socket.send({ type: 'subscribe', channel: 'quote' });
    this.socket.send({ type: 'subscribe', channel: 'positions' });
    if (selected !== null) {
      this.socket.send({ type: 'subscribe', channel: 'book', symbols: [selected] });
    }
  }
}
