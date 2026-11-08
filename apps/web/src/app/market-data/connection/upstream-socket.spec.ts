import type { ServerMessage } from '../market-protocol';
import { FakeWebSocket } from '../testing/fake-web-socket';
import { UpstreamSocket } from './upstream-socket';
import type { ConnectionStatus } from './worker-messages';

const WELCOME: ServerMessage = { type: 'welcome', channels: ['quote'], symbols: ['ALFA3'] };
const SUBSCRIBED: ServerMessage = { type: 'subscribed', channel: 'quote', symbols: ['ALFA3'] };

describe('UpstreamSocket', () => {
  let socket: UpstreamSocket;
  let statuses: ConnectionStatus[];
  let received: ServerMessage[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    statuses = [];
    received = [];
    socket = new UpstreamSocket('ws://teste', {
      onStatus: (status) => statuses.push(status),
      onMessage: (message) => received.push(message),
    });
  });

  afterEach(() => {
    socket.disconnect();
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

  it('informa connected antes de publicar o welcome', () => {
    const order: string[] = [];
    socket = new UpstreamSocket('ws://teste', {
      onStatus: (status) => order.push(status),
      onMessage: (message) => order.push(message.type),
    });

    connectAndWelcome();

    expect(order).toEqual(['connecting', 'connected', 'welcome']);
  });

  it('passa ao listener o texto original do frame', () => {
    const frames: string[] = [];
    socket = new UpstreamSocket('ws://teste', {
      onStatus: () => undefined,
      onMessage: (_message, frame) => frames.push(frame),
    });
    const current = connectAndWelcome();
    const frame = JSON.stringify(SUBSCRIBED, null, 2);

    current.receiveFrame(frame);

    expect(frames).toEqual([JSON.stringify(WELCOME), frame]);
  });

  describe('frames inválidos', () => {
    it.each([
      ['JSON malformado', 'isto não é json'],
      ['type desconhecido', '{"type":"desconhecido"}'],
      ['sem objeto', '42'],
      ['binário', new ArrayBuffer(4)],
    ])('ignora %s e continua tratando as mensagens seguintes', (_name, frame) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const current = connectAndWelcome();

      current.receiveFrame(frame);
      current.receive(SUBSCRIBED);

      expect(received).toEqual([WELCOME, SUBSCRIBED]);
      expect(statuses.at(-1)).toBe('connected');
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
      expect(statuses.at(-1)).toBe('connected');

      vi.advanceTimersByTime(1);
      expect(statuses.at(-1)).toBe('reconnecting');
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

      expect(statuses.at(-1)).toBe('connected');
      expect(FakeWebSocket.instances).toHaveLength(1);
    });
  });

  describe('encerramento', () => {
    it('fecha o socket e não reconecta', () => {
      const current = connectAndWelcome();

      socket.disconnect();
      vi.advanceTimersByTime(120_000);

      expect(current.closeCode).toBe(1000);
      expect(statuses.at(-1)).toBe('closed');
      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('cancela a tentativa pendente', () => {
      connectAndWelcome().drop();

      socket.disconnect();
      vi.advanceTimersByTime(120_000);

      expect(statuses.at(-1)).toBe('closed');
      expect(FakeWebSocket.instances).toHaveLength(1);
    });
  });
});
