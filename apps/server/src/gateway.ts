import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { WebSocket, WebSocketServer } from 'ws';

import { buildPortfolio } from './market/portfolio.js';
import { MarketSimulator, type RandomSource } from './market/simulator.js';
import { CHANNELS, parseClientMessage, type ClientMessage, type ServerMessage } from './protocol.js';

export const DEFAULT_TICK_INTERVAL_MS = 500;

const POSITIONS_EVERY_TICKS = 2;
const MAX_MESSAGE_BYTES = 16 * 1024;

export interface GatewayOptions {
  port: number;
  host?: string;
  tickIntervalMs?: number;
  random?: RandomSource;
}

export interface Gateway {
  readonly port: number;
  close(): Promise<void>;
}

interface Client {
  socket: WebSocket;
  quote: Set<string>;
  book: Set<string>;
  positions: boolean;
}

export async function startGateway({
  port,
  host,
  tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
  random,
}: GatewayOptions): Promise<Gateway> {
  const simulator = new MarketSimulator(random);
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

  function quoteMessage(symbol: string): ServerMessage {
    return { type: 'quote', timestamp: Date.now(), data: simulator.quote(symbol) };
  }

  function bookMessage(symbol: string): ServerMessage {
    return { type: 'book', timestamp: Date.now(), data: simulator.book(symbol) };
  }

  function positionsMessage(): ServerMessage {
    return {
      type: 'positions',
      timestamp: Date.now(),
      data: buildPortfolio((symbol) => simulator.lastCents(symbol)),
    };
  }

  function subscribe(client: Client, { channel, symbols }: ClientMessage): void {
    if (channel === 'positions') {
      client.positions = true;
      send(client, { type: 'subscribed', channel, symbols: [] });
      send(client, positionsMessage());
      return;
    }

    const requested = symbols ?? simulator.symbols;
    const buildMessage = channel === 'quote' ? quoteMessage : bookMessage;
    requested.forEach((symbol) => client[channel].add(symbol));
    send(client, { type: 'subscribed', channel, symbols: requested });
    requested.forEach((symbol) => send(client, buildMessage(symbol)));
  }

  function unsubscribe(client: Client, { channel, symbols }: ClientMessage): void {
    if (channel === 'positions') {
      client.positions = false;
      send(client, { type: 'unsubscribed', channel, symbols: [] });
      return;
    }

    const requested = symbols ?? simulator.symbols;
    requested.forEach((symbol) => client[channel].delete(symbol));
    send(client, { type: 'unsubscribed', channel, symbols: requested });
  }

  function handleMessage(client: Client, raw: string): void {
    const result = parseClientMessage(raw, knownSymbols);
    if (!result.ok) {
      send(client, { type: 'error', code: result.code, message: result.message });
    } else if (result.message.type === 'subscribe') {
      subscribe(client, result.message);
    } else {
      unsubscribe(client, result.message);
    }
  }

  server.on('connection', (socket) => {
    const client: Client = { socket, quote: new Set(), book: new Set(), positions: false };
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

  let tickCount = 0;

  function publishCycle(): void {
    simulator.tick();
    tickCount++;

    for (const symbol of simulator.symbols) {
      const quoteFrame = JSON.stringify(quoteMessage(symbol));
      const bookFrame = JSON.stringify(bookMessage(symbol));
      for (const client of clients) {
        if (client.quote.has(symbol)) {
          sendFrame(client, quoteFrame);
        }
        if (client.book.has(symbol)) {
          sendFrame(client, bookFrame);
        }
      }
    }

    if (tickCount % POSITIONS_EVERY_TICKS === 0) {
      const positionsFrame = JSON.stringify(positionsMessage());
      for (const client of clients) {
        if (client.positions) {
          sendFrame(client, positionsFrame);
        }
      }
    }
  }

  const timer = setInterval(publishCycle, tickIntervalMs);

  return {
    port: (server.address() as AddressInfo).port,
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
