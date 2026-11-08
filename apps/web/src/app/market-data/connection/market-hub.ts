import type { Channel, ClientMessage, ServerMessage, SubscriptionMessage } from '../market-protocol';
import { UpstreamSocket } from './upstream-socket';
import type { ConnectionStatus, TabToWorkerMessage, WorkerToTabMessage } from './worker-messages';

export interface HubPort {
  postMessage(message: WorkerToTabMessage): void;
  close(): void;
}

type FlagChannel = 'positions' | 'account';
type SymbolChannel = Exclude<Channel, FlagChannel>;

interface Tab {
  readonly id: string;
  readonly port: HubPort;
  readonly symbols: Record<SymbolChannel, Set<string>>;
  readonly flags: Record<FlagChannel, boolean>;
}

function isFlagChannel(channel: Channel): channel is FlagChannel {
  return channel === 'positions' || channel === 'account';
}

function createTab(id: string, port: HubPort): Tab {
  return {
    id,
    port,
    symbols: { quote: new Set(), book: new Set(), candle: new Set() },
    flags: { positions: false, account: false },
  };
}

function clearSubscriptions(tab: Tab): void {
  Object.values(tab.symbols).forEach((symbols) => symbols.clear());
  tab.flags.positions = false;
  tab.flags.account = false;
}

/** Compartilha uma conexão entre as abas, somando as assinaturas e dirigindo as mensagens. */
export class MarketHub {
  private readonly tabs = new Map<string, Tab>();
  private upstream: UpstreamSocket | undefined;
  private status: ConnectionStatus = 'closed';
  private lastWelcome: Extract<ServerMessage, { type: 'welcome' }> | undefined;
  private portCount = 0;

  /** Devolve a função que trata as mensagens recebidas dessa porta. */
  addPort(port: HubPort): (message: TabToWorkerMessage) => void {
    const id = `p${++this.portCount}`;
    return (message) => {
      switch (message.type) {
        case 'attach':
          this.attach(id, port, message.url);
          break;
        case 'send': {
          const tab = this.tabs.get(id);
          if (tab !== undefined && this.status === 'connected') {
            this.forward(tab, message.message);
          }
          break;
        }
        case 'detach':
          this.detach(id, port);
          break;
      }
    };
  }

  private attach(id: string, port: HubPort, url: string): void {
    if (this.tabs.has(id)) {
      return;
    }
    this.tabs.set(id, createTab(id, port));

    if (this.upstream === undefined) {
      this.upstream = new UpstreamSocket(url, {
        onStatus: (status) => this.handleStatus(status),
        onMessage: (message) => this.handleServerMessage(message),
      });
      this.upstream.connect();
      return;
    }
    port.postMessage({ type: 'status', status: this.status });
    if (this.lastWelcome !== undefined) {
      port.postMessage({ type: 'message', message: this.lastWelcome });
    }
  }

  private detach(id: string, port: HubPort): void {
    const tab = this.tabs.get(id);
    this.tabs.delete(id);
    port.close();
    if (tab === undefined) {
      return;
    }

    if (this.tabs.size === 0) {
      this.upstream?.disconnect();
      this.upstream = undefined;
      return;
    }
    if (this.status === 'connected') {
      this.releaseAll(tab);
    }
  }

  private forward(tab: Tab, message: ClientMessage): void {
    switch (message.type) {
      case 'subscribe':
        this.subscribe(tab, message);
        break;
      case 'unsubscribe':
        this.unsubscribe(tab, message);
        break;
      default:
        this.upstream?.send({ ...message, requestId: `${tab.id}:${message.requestId}` });
    }
  }

  /** Sempre vai ao servidor, porque é a resposta dele que traz o estado inicial para a aba. */
  private subscribe(tab: Tab, message: SubscriptionMessage): void {
    const { channel } = message;
    if (isFlagChannel(channel)) {
      tab.flags[channel] = true;
    } else {
      const symbols = message.symbols ?? this.lastWelcome?.symbols ?? [];
      symbols.forEach((symbol) => tab.symbols[channel].add(symbol));
    }
    this.upstream?.send(message);
  }

  /** O `unsubscribed` do servidor não diz de quem era o pedido, então a resposta é local. */
  private unsubscribe(tab: Tab, message: SubscriptionMessage): void {
    const { channel } = message;
    if (isFlagChannel(channel)) {
      this.releaseFlag(tab, channel);
      this.post(tab, { type: 'unsubscribed', channel, symbols: [] });
      return;
    }
    const symbols = message.symbols ?? [...tab.symbols[channel]];
    this.releaseSymbols(tab, channel, symbols);
    this.post(tab, { type: 'unsubscribed', channel, symbols });
  }

  private releaseAll(tab: Tab): void {
    this.releaseFlag(tab, 'positions');
    this.releaseFlag(tab, 'account');
    (['quote', 'book', 'candle'] as const).forEach((channel) => {
      this.releaseSymbols(tab, channel, [...tab.symbols[channel]]);
    });
  }

  private releaseFlag(tab: Tab, channel: FlagChannel): void {
    const held = tab.flags[channel];
    tab.flags[channel] = false;
    if (held && !this.someTab((other) => other.flags[channel])) {
      this.upstream?.send({ type: 'unsubscribe', channel });
    }
  }

  private releaseSymbols(tab: Tab, channel: SymbolChannel, symbols: readonly string[]): void {
    const released = symbols.filter(
      (symbol) =>
        tab.symbols[channel].delete(symbol) &&
        !this.someTab((other) => other.symbols[channel].has(symbol)),
    );
    if (released.length > 0) {
      this.upstream?.send({ type: 'unsubscribe', channel, symbols: released });
    }
  }

  private someTab(predicate: (tab: Tab) => boolean): boolean {
    return [...this.tabs.values()].some(predicate);
  }

  private handleStatus(status: ConnectionStatus): void {
    this.status = status;
    if (status !== 'connected') {
      this.lastWelcome = undefined;
      // Assinaturas valem por conexão no servidor, e cada `welcome` faz as abas as refazerem.
      this.tabs.forEach(clearSubscriptions);
    }
    this.tabs.forEach((tab) => tab.port.postMessage({ type: 'status', status }));
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.lastWelcome = message;
        this.broadcast(message);
        break;
      case 'subscribed':
        this.tabs.forEach((tab) => {
          if (this.holdsSubscription(tab, message.channel, message.symbols)) {
            this.post(tab, message);
          }
        });
        break;
      case 'unsubscribed':
        break;
      case 'error':
        if (message.requestId === undefined) {
          this.broadcast(message);
        } else {
          this.respond(message.requestId, (requestId) => ({ ...message, requestId }));
        }
        break;
      case 'quotes':
        this.deliverQuotes(message);
        break;
      case 'book':
        this.deliverToHolders('book', message.data.symbol, message);
        break;
      case 'candle':
        this.deliverToHolders('candle', message.data.symbol, message);
        break;
      case 'positions':
      case 'account':
        this.tabs.forEach((tab) => {
          if (tab.flags[message.type]) {
            this.post(tab, message);
          }
        });
        break;
      case 'candles':
      case 'orders':
        this.respond(message.requestId, (requestId) => ({ ...message, requestId }));
        break;
    }
  }

  private holdsSubscription(tab: Tab, channel: Channel, symbols: readonly string[]): boolean {
    if (isFlagChannel(channel)) {
      return tab.flags[channel];
    }
    return symbols.some((symbol) => tab.symbols[channel].has(symbol));
  }

  private deliverToHolders(
    channel: SymbolChannel,
    symbol: string,
    message: ServerMessage,
  ): void {
    this.tabs.forEach((tab) => {
      if (tab.symbols[channel].has(symbol)) {
        this.post(tab, message);
      }
    });
  }

  private deliverQuotes(message: Extract<ServerMessage, { type: 'quotes' }>): void {
    this.tabs.forEach((tab) => {
      const data = message.data.filter((quote) => tab.symbols.quote.has(quote.symbol));
      if (data.length > 0) {
        this.post(tab, data.length === message.data.length ? message : { ...message, data });
      }
    });
  }

  /** O `requestId` enviado ao servidor é `<id da aba>:<original>`. */
  private respond(prefixed: string, build: (requestId: string) => ServerMessage): void {
    const separator = prefixed.indexOf(':');
    const tab = this.tabs.get(prefixed.slice(0, separator));
    if (tab !== undefined) {
      this.post(tab, build(prefixed.slice(separator + 1)));
    }
  }

  private broadcast(message: ServerMessage): void {
    this.tabs.forEach((tab) => this.post(tab, message));
  }

  private post(tab: Tab, message: ServerMessage): void {
    tab.port.postMessage({ type: 'message', message });
  }
}
