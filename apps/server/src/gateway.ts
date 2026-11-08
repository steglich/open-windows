import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { WebSocket, WebSocketServer } from 'ws';

import { generateAccount } from './market/orders.js';
import { buildAccountBalance, buildPortfolio } from './market/portfolio.js';
import { randomSeed } from './market/random.js';
import { MarketSimulator } from './market/simulator.js';
import type { SimulationVolume } from './market/volume.js';
import {
  CHANNELS,
  parseClientMessage,
  type GetCandlesMessage,
  type GetOrdersMessage,
  type ServerMessage,
  type SubscriptionMessage,
} from './protocol.js';

export const DEFAULT_TICK_INTERVAL_MS = 500;

/** Início do relógio simulado, usado quando há seed para que as datas também se repitam. */
export const SIMULATED_START_TIME = Date.parse('2026-01-05T16:00:00-03:00');

const POSITIONS_EVERY_TICKS = 2;
const MAX_MESSAGE_BYTES = 16 * 1024;

export interface GatewayOptions {
  port: number;
  host?: string;
  tickIntervalMs?: number;
  /** Com seed, dados e timestamps se repetem. Sem seed, usa o relógio real. */
  seed?: number;
  volume?: Partial<SimulationVolume>;
}

export interface Gateway {
  readonly port: number;
  readonly seed: number;
  close(): Promise<void>;
}

interface Client {
  socket: WebSocket;
  quote: Set<string>;
  book: Set<string>;
  positions: boolean;
  account: boolean;
}

export async function startGateway({
  port,
  host,
  tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
  seed,
  volume,
}: GatewayOptions): Promise<Gateway> {
  const usesSimulatedClock = seed !== undefined;
  const resolvedSeed = seed ?? randomSeed();
  const startTime = usesSimulatedClock ? SIMULATED_START_TIME : Date.now();
  let simulatedNow = startTime;
  const now = (): number => (usesSimulatedClock ? simulatedNow : Date.now());

  const simulator = new MarketSimulator({ seed: resolvedSeed, startTime, volume });
  const account = generateAccount({
    history: simulator.history,
    symbols: simulator.symbols,
    seed: resolvedSeed,
    volume: simulator.volume,
    startTime,
  });
  const lastCents = (symbol: string): number => simulator.lastCents(symbol);
  const knownSymbols = new Set(simulator.symbols);
  const clients = new Set<Client>();

  const server = new WebSocketServer({ port, host, maxPayload: MAX_MESSAGE_BYTES });
  await once(server, 'listening');

  function sendFrame(client: Client, frame: string): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(frame);
    }
  }

  function send(client: Client, message: ServerMessage): void {
    sendFrame(client, JSON.stringify(message));
  }

  /** Serializa a mensagem uma única vez e só se houver quem a receba. */
  function broadcast(wants: (client: Client) => boolean, build: () => ServerMessage): void {
    let frame: string | undefined;
    for (const client of clients) {
      if (wants(client)) {
        frame ??= JSON.stringify(build());
        sendFrame(client, frame);
      }
    }
  }

  function quotesMessage(symbols: readonly string[]): ServerMessage {
    return {
      type: 'quotes',
      timestamp: now(),
      data: symbols.map((symbol) => simulator.quote(symbol)),
    };
  }

  function bookMessage(symbol: string): ServerMessage {
    return { type: 'book', timestamp: now(), data: simulator.book(symbol) };
  }

  function positionsMessage(): ServerMessage {
    return {
      type: 'positions',
      timestamp: now(),
      data: buildPortfolio(account.holdings, lastCents),
    };
  }

  function accountMessage(): ServerMessage {
    return {
      type: 'account',
      timestamp: now(),
      data: buildAccountBalance(account, lastCents),
    };
  }

  function subscribe(client: Client, { channel, symbols }: SubscriptionMessage): void {
    if (channel === 'positions' || channel === 'account') {
      client[channel] = true;
      send(client, { type: 'subscribed', channel, symbols: [] });
      send(client, channel === 'positions' ? positionsMessage() : accountMessage());
      return;
    }

    const requested = symbols ?? simulator.symbols;
    requested.forEach((symbol) => client[channel].add(symbol));
    send(client, { type: 'subscribed', channel, symbols: requested });
    if (channel === 'quote') {
      send(client, quotesMessage(requested));
    } else {
      requested.forEach((symbol) => send(client, bookMessage(symbol)));
    }
  }

  function unsubscribe(client: Client, { channel, symbols }: SubscriptionMessage): void {
    if (channel === 'positions' || channel === 'account') {
      client[channel] = false;
      send(client, { type: 'unsubscribed', channel, symbols: [] });
      return;
    }

    const requested = symbols ?? simulator.symbols;
    requested.forEach((symbol) => client[channel].delete(symbol));
    send(client, { type: 'unsubscribed', channel, symbols: requested });
  }

  function respondCandles(
    client: Client,
    { requestId, symbol, limit, before }: GetCandlesMessage,
  ): void {
    send(client, {
      type: 'candles',
      requestId,
      timestamp: now(),
      data: { symbol, interval: '1m', candles: simulator.candles(symbol, limit, before) },
    });
  }

  function respondOrders(client: Client, { requestId, ...query }: GetOrdersMessage): void {
    send(client, {
      type: 'orders',
      requestId,
      timestamp: now(),
      data: account.ledger.query(query),
    });
  }

  function handleMessage(client: Client, raw: string): void {
    const result = parseClientMessage(raw, knownSymbols);
    if (!result.ok) {
      const { code, message, requestId } = result;
      send(client, { type: 'error', code, message, requestId });
      return;
    }

    const { message } = result;
    switch (message.type) {
      case 'subscribe':
        subscribe(client, message);
        break;
      case 'unsubscribe':
        unsubscribe(client, message);
        break;
      case 'getCandles':
        respondCandles(client, message);
        break;
      case 'getOrders':
        respondOrders(client, message);
        break;
    }
  }

  server.on('connection', (socket) => {
    const client: Client = {
      socket,
      quote: new Set(),
      book: new Set(),
      positions: false,
      account: false,
    };
    clients.add(client);

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        send(client, {
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: 'As mensagens devem ser enviadas como texto.',
        });
        return;
      }
      handleMessage(client, data.toString());
    });
    socket.on('close', () => clients.delete(client));
    // Sem este listener, um frame acima do limite derrubaria o processo. A conexão fecha em seguida.
    socket.on('error', () => clients.delete(client));

    send(client, { type: 'welcome', channels: CHANNELS, symbols: simulator.symbols });
  });

  /** Um frame por cliente e por ciclo: em lote, o navegador processa tudo em uma única tarefa. */
  function publishQuotes(): void {
    let fullFrame: string | undefined;
    for (const client of clients) {
      if (client.quote.size === simulator.symbols.length) {
        fullFrame ??= JSON.stringify(quotesMessage(simulator.symbols));
        sendFrame(client, fullFrame);
      } else if (client.quote.size > 0) {
        send(client, quotesMessage(simulator.symbols.filter((symbol) => client.quote.has(symbol))));
      }
    }
  }

  function publishBooks(): void {
    for (const symbol of simulator.symbols) {
      broadcast(
        (client) => client.book.has(symbol),
        () => bookMessage(symbol),
      );
    }
  }

  let tickCount = 0;

  function publishCycle(): void {
    if (usesSimulatedClock) {
      simulatedNow += tickIntervalMs;
    }
    simulator.tick(now());
    tickCount++;

    publishQuotes();
    publishBooks();

    if (tickCount % POSITIONS_EVERY_TICKS === 0) {
      broadcast((client) => client.positions, positionsMessage);
      broadcast((client) => client.account, accountMessage);
    }
  }

  const timer = setInterval(publishCycle, tickIntervalMs);

  return {
    port: (server.address() as AddressInfo).port,
    seed: resolvedSeed,
    close() {
      clearInterval(timer);
      for (const { socket } of clients) {
        socket.terminate();
      }
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
