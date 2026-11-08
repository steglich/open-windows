import { TestBed } from '@angular/core/testing';

import { MarketSocket } from './market-socket';
import type { ServerMessage } from './market-protocol';
import { FakeWebSocket } from './testing/fake-web-socket';
import { IN_PROCESS_MARKET_CONNECTION_PROVIDERS } from './testing/in-process-market-connection';

const WELCOME: ServerMessage = { type: 'welcome', channels: ['quote'], symbols: ['ALFA3'] };
const SUBSCRIBED: ServerMessage = { type: 'subscribed', channel: 'quote', symbols: ['ALFA3'] };

describe('MarketSocket', () => {
  let socket: MarketSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    TestBed.configureTestingModule({ providers: IN_PROCESS_MARKET_CONNECTION_PROVIDERS });
    socket = TestBed.inject(MarketSocket);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function connectAndWelcome(): FakeWebSocket {
    socket.connect();
    const current = FakeWebSocket.last;
    current.open();
    current.receive(WELCOME);
    return current;
  }

  describe('estados da conexão', () => {
    it('continua connecting até receber welcome', () => {
      socket.connect();
      FakeWebSocket.last.open();
      expect(socket.status()).toBe('connecting');

      FakeWebSocket.last.receive(WELCOME);
      expect(socket.status()).toBe('connected');
    });

    it('não abre uma segunda conexão se já houver uma', () => {
      socket.connect();
      socket.connect();
      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('passa a reconnecting quando a conexão cai', () => {
      connectAndWelcome().drop();
      expect(socket.status()).toBe('reconnecting');
    });

    it('volta a conectar depois de um disconnect', () => {
      connectAndWelcome();
      socket.disconnect();

      connectAndWelcome();

      expect(socket.status()).toBe('connected');
      expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it('publica cada mensagem de uma rajada', () => {
      const received: ServerMessage[] = [];
      socket.messages.subscribe((message) => received.push(message));

      const current = connectAndWelcome();
      current.receive(SUBSCRIBED);
      current.receive(SUBSCRIBED);

      expect(received).toEqual([WELCOME, SUBSCRIBED, SUBSCRIBED]);
    });
  });

  describe('tipos de mensagem', () => {
    it.each<ServerMessage>([
      { type: 'quotes', timestamp: 1, data: [] },
      {
        type: 'account',
        timestamp: 1,
        data: { accountId: 'SIM-0001', availableBalance: 1, blockedBalance: 2, totalEquity: 3 },
      },
      {
        type: 'candles',
        requestId: 'a',
        timestamp: 1,
        data: { symbol: 'PETR4', interval: '1m', candles: [] },
      },
      { type: 'orders', requestId: 'b', timestamp: 1, data: { items: [], total: 0, offset: 0, limit: 100 } },
      {
        type: 'candle',
        timestamp: 1,
        data: {
          symbol: 'PETR4',
          interval: '1m',
          candle: { time: 0, open: 1, high: 2, low: 1, close: 2, volume: 10, financialVolume: 20 },
        },
      },
    ])('aceita mensagens $type', (message) => {
      const received: ServerMessage[] = [];
      socket.messages.subscribe((value) => received.push(value));
      const current = connectAndWelcome();

      current.receive(message);

      expect(received).toEqual([WELCOME, message]);
    });
  });

  describe('encerramento', () => {
    it('fecha o socket e não reconecta ao ser destruído com a conexão aberta', () => {
      const current = connectAndWelcome();

      TestBed.resetTestingModule();
      vi.advanceTimersByTime(120_000);

      expect(current.closeCode).toBe(1000);
      expect(socket.status()).toBe('closed');
      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('cancela a tentativa pendente ao ser destruído durante a espera', () => {
      connectAndWelcome().drop();

      TestBed.resetTestingModule();
      vi.advanceTimersByTime(120_000);

      expect(socket.status()).toBe('closed');
      expect(FakeWebSocket.instances).toHaveLength(1);
    });
  });
});
