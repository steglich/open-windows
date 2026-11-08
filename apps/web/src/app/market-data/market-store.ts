import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MarketSocket } from './market-socket';
import type {
  AccountBalance,
  Candle,
  Channel,
  ClientMessage,
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

/** Dados que um painel pode precisar. `selectedQuote` é a cotação só do ativo selecionado. */
export type MarketFeed = 'quotes' | 'selectedQuote' | 'book' | 'candles' | 'positions' | 'account';

export const ALL_MARKET_FEEDS: readonly MarketFeed[] = [
  'quotes',
  'selectedQuote',
  'book',
  'candles',
  'positions',
  'account',
];

/** Por canal, os ativos assinados. `null` significa todos, ou um canal sem ativos. */
type Subscriptions = ReadonlyMap<Channel, readonly string[] | null>;

const CHANNEL_ORDER: readonly Channel[] = ['quote', 'positions', 'account', 'book', 'candle'];

const CANDLE_LIMIT = 120;

function sameTarget(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined,
): boolean {
  return a === b || (!!a && !!b && a.join() === b.join());
}

function sameCandle(a: Candle, b: Candle): boolean {
  return (
    a.time === b.time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume &&
    a.financialVolume === b.financialVolume
  );
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
  private readonly accountState = signal<AccountBalance | null>(null);
  private readonly candlesState = signal<readonly Candle[] | null>(null);
  private readonly lastErrorState = signal<MarketError | null>(null);

  /** Começa vazio para um `welcome` anterior à rota não assinar o que o documento não usa. */
  private feeds: ReadonlySet<MarketFeed> = new Set();
  private subscriptions: Subscriptions = new Map();
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

  /** Define os dados usados pelos painéis exibidos neste documento. */
  setFeeds(feeds: Iterable<MarketFeed>): void {
    const next = new Set(feeds);
    if (next.size === this.feeds.size && [...next].every((feed) => this.feeds.has(feed))) {
      return;
    }
    this.feeds = next;
    this.discardUnusedData();
    this.syncSubscriptions();
  }

  select(symbol: string): void {
    if (symbol === this.selectedSymbolState()) {
      return;
    }
    this.selectedSymbolState.set(symbol);
    this.clearSelectionData();
    this.discardUnusedData();
    this.syncSubscriptions();
  }

  /** Único ponto que assina e cancela, comparando o que é desejado com o que está assinado. */
  private syncSubscriptions(): void {
    if (this.status() !== 'connected' || this.symbolsState().length === 0) {
      return;
    }
    const current = this.subscriptions;
    const wanted = this.wantedSubscriptions();
    const changed = CHANNEL_ORDER.filter(
      (channel) => !sameTarget(current.get(channel), wanted.get(channel)),
    );

    changed
      .filter((channel) => current.has(channel))
      .forEach((channel) => this.sendSubscription('unsubscribe', channel, current));
    changed
      .filter((channel) => wanted.has(channel))
      .forEach((channel) => this.sendSubscription('subscribe', channel, wanted));
    this.subscriptions = wanted;

    const selected = this.selectedSymbolState();
    if (changed.includes('candle') && wanted.has('candle') && selected !== null) {
      this.requestCandles(selected);
    }
  }

  private wantedSubscriptions(): Subscriptions {
    const wanted = new Map<Channel, readonly string[] | null>();
    const selected = this.selectedSymbolState();

    if (this.feeds.has('quotes')) {
      wanted.set('quote', null);
    } else if (this.feeds.has('selectedQuote') && selected !== null) {
      wanted.set('quote', [selected]);
    }
    if (this.feeds.has('positions')) {
      wanted.set('positions', null);
    }
    if (this.feeds.has('account')) {
      wanted.set('account', null);
    }
    if (this.feeds.has('book') && selected !== null) {
      wanted.set('book', [selected]);
    }
    if (this.feeds.has('candles') && selected !== null) {
      wanted.set('candle', [selected]);
    }
    return wanted;
  }

  private sendSubscription(
    type: 'subscribe' | 'unsubscribe',
    channel: Channel,
    subscriptions: Subscriptions,
  ): void {
    const symbols = subscriptions.get(channel);
    const message: ClientMessage = symbols ? { type, channel, symbols: [...symbols] } : { type, channel };
    this.socket.send(message);
  }

  /** O servidor reenvia o estado ao assinar de novo, então nada antigo precisa ser mantido. */
  private discardUnusedData(): void {
    if (!this.feeds.has('positions')) {
      this.portfolioState.set(null);
    }
    if (!this.feeds.has('account')) {
      this.accountState.set(null);
    }
    if (!this.feeds.has('book')) {
      this.bookState.set(null);
    }
    if (!this.feeds.has('candles')) {
      this.candlesState.set(null);
      this.pendingCandlesRequestId = null;
    }
    if (!this.feeds.has('quotes')) {
      this.quotes.update((quotes) =>
        Object.fromEntries(Object.entries(quotes).filter(([symbol]) => this.usesQuote(symbol))),
      );
    }
  }

  private usesQuote(symbol: string): boolean {
    return (
      this.feeds.has('quotes') ||
      (this.feeds.has('selectedQuote') && symbol === this.selectedSymbolState())
    );
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
        if (this.feeds.has('book') && message.data.symbol === this.selectedSymbolState()) {
          this.bookState.set(message.data);
        }
        break;
      case 'candle':
        if (this.feeds.has('candles') && message.data.symbol === this.selectedSymbolState()) {
          this.applyCandle(message.data.symbol, message.data.candle);
        }
        break;
      case 'positions':
        if (this.feeds.has('positions')) {
          this.portfolioState.set(message.data);
        }
        break;
      case 'account':
        if (this.feeds.has('account')) {
          this.accountState.set(message.data);
        }
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
    const used = batch.filter(({ symbol }) => this.usesQuote(symbol));
    if (used.length === 0) {
      return;
    }
    this.quotes.update((quotes) => {
      const updated = { ...quotes };
      for (const quote of used) {
        updated[quote.symbol] = quote;
      }
      return updated;
    });
  }

  /** Um candle igual ao atual mantém o array, para o gráfico não redesenhar sem motivo. */
  private applyCandle(symbol: string, candle: Candle): void {
    const candles = this.candlesState();
    const current = candles?.at(-1);
    if (candles === null || current === undefined) {
      return;
    }

    if (candle.time > current.time) {
      if (this.pendingCandlesRequestId === null) {
        this.requestCandles(symbol);
      }
      return;
    }
    if (candle.time === current.time && !sameCandle(candle, current)) {
      this.candlesState.set([...candles.slice(0, -1), candle]);
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

    this.discardUnusedData();
    this.subscriptions = new Map();
    this.syncSubscriptions();
  }
}
