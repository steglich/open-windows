import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { WebSocket, WebSocketServer } from 'ws';

import { generateAccount } from './market/orders.js';
import { buildAccountBalance, buildPortfolio } from './market/portfolio.js';
import { randomSeed } from './market/random.js';
import { MarketSimulator } from './market/simulator.js';
import type { SimulationVolume } from './market/volume.js';
import { ChannelPacer } from './pacing.js';
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
const PACE_INTERVAL_MS = 10;
/** Acima disso, a conexão não acompanha o fluxo e deixa de receber as mensagens contínuas. */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

const CONTINUOUS_CHANNELS = ['quote', 'book', 'candle'] as const;

type ContinuousChannel = (typeof CONTINUOUS_CHANNELS)[number];

/** Mensagens por segundo de cada canal contínuo, por conexão. Zero desliga o envio. */
export type ChannelRates = Record<ContinuousChannel, number>;

export const DEFAULT_CHANNEL_RATES: ChannelRates = { quote: 500, book: 1000, candle: 350 };

export interface GatewayOptions {
  port: number;
  host?: string;
  tickIntervalMs?: number;
  /** Com seed, dados e timestamps se repetem. Sem seed, usa o relógio real. */
  seed?: number;
  volume?: Partial<SimulationVolume>;
  rates?: Partial<ChannelRates>;
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
  candle: Set<string>;
  positions: boolean;
  account: boolean;
  pacers: Record<ContinuousChannel, ChannelPacer>;
}

export async function startGateway({
  port,
  host,
  tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
  seed,
  volume,
  rates,
}: GatewayOptions): Promise<Gateway> {
  const channelRates = { ...DEFAULT_CHANNEL_RATES, ...rates };
  const usesSimulatedClock = seed !== undefined;
  const resolvedSeed = seed ?? randomSeed();
  const startTime = usesSimulatedClock ? SIMULATED_START_TIME : Date.now();
  let simulatedNow = startTime;
  const now = (): number => (usesSimulatedClock ? simulatedNow : Date.now());
  const monotonicNow = (): number => performance.now();
  let cycleAt = startTime;
  const cycleFrames = new Map<string, string>();

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

  function quotesMessage(symbols: readonly string[], timestamp = now()): ServerMessage {
    return {
      type: 'quotes',
      timestamp,
      data: symbols.map((symbol) => simulator.quote(symbol)),
    };
  }

  function bookMessage(symbol: string, timestamp = now()): ServerMessage {
    return { type: 'book', timestamp, data: simulator.book(symbol) };
  }

  function candleMessage(symbol: string, timestamp = now()): ServerMessage {
    return {
      type: 'candle',
      timestamp,
      data: { symbol, interval: '1m', candle: simulator.candles(symbol, 1)[0]! },
    };
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
    updateRotation(client, channel);
    send(client, { type: 'subscribed', channel, symbols: requested });
    if (channel === 'quote') {
      send(client, quotesMessage(requested));
    } else if (channel === 'book') {
      requested.forEach((symbol) => send(client, bookMessage(symbol)));
    } else {
      requested.forEach((symbol) => send(client, candleMessage(symbol)));
    }
  }

  function updateRotation(client: Client, channel: ContinuousChannel): void {
    client.pacers[channel].setSymbols(
      simulator.symbols.filter((symbol) => client[channel].has(symbol)),
    );
  }

  function unsubscribe(client: Client, { channel, symbols }: SubscriptionMessage): void {
    if (channel === 'positions' || channel === 'account') {
      client[channel] = false;
      send(client, { type: 'unsubscribed', channel, symbols: [] });
      return;
    }

    const requested = symbols ?? simulator.symbols;
    requested.forEach((symbol) => client[channel].delete(symbol));
    updateRotation(client, channel);
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
      candle: new Set(),
      positions: false,
      account: false,
      pacers: {
        quote: new ChannelPacer(channelRates.quote, monotonicNow),
        book: new ChannelPacer(channelRates.book, monotonicNow),
        candle: new ChannelPacer(channelRates.candle, monotonicNow),
      },
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

  function continuousMessage(channel: ContinuousChannel, symbol: string): ServerMessage {
    switch (channel) {
      case 'quote':
        return quotesMessage([symbol], cycleAt);
      case 'book':
        return bookMessage(symbol, cycleAt);
      case 'candle':
        return candleMessage(symbol, cycleAt);
    }
  }

  /** Serializa cada item uma vez por ciclo, já que entre os ciclos o estado não muda. */
  function continuousFrame(channel: ContinuousChannel, symbol: string): string {
    const key = `${channel}:${symbol}`;
    let frame = cycleFrames.get(key);
    if (frame === undefined) {
      frame = JSON.stringify(continuousMessage(channel, symbol));
      cycleFrames.set(key, frame);
    }
    return frame;
  }

  function publishContinuous(): void {
    for (const client of clients) {
      const blocked = client.socket.bufferedAmount > MAX_BUFFERED_BYTES;
      for (const channel of CONTINUOUS_CHANNELS) {
        for (const symbol of client.pacers[channel].take(blocked)) {
          sendFrame(client, continuousFrame(channel, symbol));
        }
      }
    }
  }

  let tickCount = 0;

  function advanceMarket(): void {
    if (usesSimulatedClock) {
      simulatedNow += tickIntervalMs;
    }
    cycleAt = now();
    simulator.tick(cycleAt);
    cycleFrames.clear();
    tickCount++;

    if (tickCount % POSITIONS_EVERY_TICKS === 0) {
      broadcast((client) => client.positions, positionsMessage);
      broadcast((client) => client.account, accountMessage);
    }
  }

  const marketTimer = setInterval(advanceMarket, tickIntervalMs);
  const paceTimer = setInterval(publishContinuous, PACE_INTERVAL_MS);

  return {
    port: (server.address() as AddressInfo).port,
    seed: resolvedSeed,
    close() {
      clearInterval(marketTimer);
      clearInterval(paceTimer);
      for (const { socket } of clients) {
        socket.terminate();
      }
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
