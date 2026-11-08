import { TestBed } from '@angular/core/testing';

import { MarketSocket } from './market-socket';
import type { ServerMessage } from './market-protocol';
import { FakeWebSocket } from './testing/fake-web-socket';

const WELCOME: ServerMessage = { type: 'welcome', channels: ['quote'], symbols: ['ALFA3'] };
const SUBSCRIBED: ServerMessage = { type: 'subscribed', channel: 'quote', symbols: ['ALFA3'] };

describe('MarketSocket', () => {
  let socket: MarketSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
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

  describe('frames inválidos', () => {
    it.each([
      ['JSON malformado', 'isto não é json'],
      ['type desconhecido', '{"type":"desconhecido"}'],
      ['sem objeto', '42'],
      ['binário', new ArrayBuffer(4)],
    ])('ignora %s e continua tratando as mensagens seguintes', (_name, frame) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const received: ServerMessage[] = [];
      socket.messages.subscribe((message) => received.push(message));
      const current = connectAndWelcome();

      current.receiveFrame(frame);
      current.receive(SUBSCRIBED);

      expect(received).toEqual([WELCOME, SUBSCRIBED]);
      expect(socket.status()).toBe('connected');
      expect(FakeWebSocket.instances).toHaveLength(1);
    });
  });

  describe('reconexão', () => {
    it('espera 1, 2, 4, 8, 16, 30 e 30 segundos entre as tentativas', () => {
      socket.connect();

      for (const seconds of [1, 2, 4, 8, 16, 30, 30]) {
        const attempts = FakeWebSocket.instances.length;
        FakeWebSocket.last.drop();

        vi.advanceTimersByTime(seconds * 1000 - 1);
        expect(FakeWebSocket.instances).toHaveLength(attempts);

        vi.advanceTimersByTime(1);
        expect(FakeWebSocket.instances).toHaveLength(attempts + 1);
      }
    });

    it('volta a esperar 1 segundo depois de um welcome', () => {
      socket.connect();
      FakeWebSocket.last.drop();
      vi.advanceTimersByTime(1000);
      FakeWebSocket.last.drop();
      vi.advanceTimersByTime(2000);

      FakeWebSocket.last.open();
      FakeWebSocket.last.receive(WELCOME);
      FakeWebSocket.last.drop();
      const attempts = FakeWebSocket.instances.length;
      vi.advanceTimersByTime(1000);

      expect(FakeWebSocket.instances).toHaveLength(attempts + 1);
    });

    it('ignora o close atrasado do socket descartado', () => {
      const silent = connectAndWelcome();
      vi.advanceTimersByTime(5000);
      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(silent.onclose).toBeNull();

      silent.drop();
      vi.advanceTimersByTime(1000);

      expect(FakeWebSocket.instances).toHaveLength(2);
    });
  });

  describe('conexão silenciosa', () => {
    it('reconecta depois de 5 segundos sem mensagens', () => {
      const silent = connectAndWelcome();

      vi.advanceTimersByTime(4999);
      expect(socket.status()).toBe('connected');

      vi.advanceTimersByTime(1);
      expect(socket.status()).toBe('reconnecting');
      expect(silent.readyState).toBe(FakeWebSocket.CLOSED);

      vi.advanceTimersByTime(1000);
      expect(FakeWebSocket.instances).toHaveLength(2);
    });

    it('mantém a conexão enquanto as mensagens chegam', () => {
      const current = connectAndWelcome();

      for (let elapsed = 0; elapsed < 20_000; elapsed += 1000) {
        vi.advanceTimersByTime(1000);
        current.receive(SUBSCRIBED);
      }

      expect(socket.status()).toBe('connected');
      expect(FakeWebSocket.instances).toHaveLength(1);
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
