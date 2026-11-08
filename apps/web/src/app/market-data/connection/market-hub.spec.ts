import type { ClientMessage, ServerMessage } from '../market-protocol';
import { FakeWebSocket } from '../testing/fake-web-socket';
import {
  accountMessage,
  book,
  candle,
  candleMessage,
  positionsMessage,
  quote,
  quoteMessage,
  welcome,
} from '../testing/market-fixtures';
import { MarketHub } from './market-hub';
import type { ConnectionStatus, TabToWorkerMessage, WorkerToTabMessage } from './worker-messages';

class FakeTab {
  readonly posts: WorkerToTabMessage[] = [];
  closed = false;
  private readonly receive: (message: TabToWorkerMessage) => void;

  constructor(hub: MarketHub) {
    this.receive = hub.addPort({
      postMessage: (message) => this.posts.push(message),
      close: () => (this.closed = true),
    });
  }

  attach(lock?: string): this {
    this.receive(lock === undefined ? { type: 'attach', url: 'ws://teste' } : { type: 'attach', url: 'ws://teste', lock });
    return this;
  }

  send(message: ClientMessage): void {
    this.receive({ type: 'send', message });
  }

  detach(): void {
    this.receive({ type: 'detach' });
  }

  get statuses(): ConnectionStatus[] {
    return this.posts.flatMap((post) => (post.type === 'status' ? [post.status] : []));
  }

  get messages(): ServerMessage[] {
    return this.posts.flatMap((post) => {
      if (post.type === 'message') {
        return [post.message];
      }
      return post.type === 'frame' ? [JSON.parse(post.frame) as ServerMessage] : [];
    });
  }

  get frames(): Extract<WorkerToTabMessage, { type: 'frame' }>[] {
    return this.posts.flatMap((post) => (post.type === 'frame' ? [post] : []));
  }

  clear(): void {
    this.posts.length = 0;
  }
}

describe('MarketHub', () => {
  let hub: MarketHub;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    hub = new MarketHub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function connected(): { socket: FakeWebSocket; first: FakeTab } {
    const first = new FakeTab(hub).attach();
    const socket = FakeWebSocket.last;
    socket.open();
    socket.receive(welcome());
    return { socket, first };
  }

  function twoTabs(): { socket: FakeWebSocket; first: FakeTab; second: FakeTab } {
    const { socket, first } = connected();
    return { socket, first, second: new FakeTab(hub).attach() };
  }

  function subscribeBook(tab: FakeTab, symbol: string): void {
    tab.send({ type: 'subscribe', channel: 'book', symbols: [symbol] });
  }

  describe('entrada de abas', () => {
    it('abre uma única conexão para várias abas', () => {
      twoTabs();

      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('entrega estado e welcome só à aba que entrou com a conexão ativa', () => {
      const { first } = connected();
      first.clear();

      const second = new FakeTab(hub).attach();

      expect(second.posts).toEqual([
        { type: 'status', status: 'connected' },
        { type: 'message', message: welcome() },
      ]);
      expect(first.posts).toEqual([]);
    });

    it('não repete welcome para aba que entra durante a reconexão', () => {
      connected().socket.drop();

      const second = new FakeTab(hub).attach();

      expect(second.posts).toEqual([{ type: 'status', status: 'reconnecting' }]);
    });

    it('encaminha a assinatura de uma nova aba para ela receber o estado inicial', () => {
      const { socket, first } = twoTabs();
      first.send({ type: 'subscribe', channel: 'positions' });
      socket.sent.length = 0;

      const third = new FakeTab(hub).attach();
      third.send({ type: 'subscribe', channel: 'positions' });

      expect(socket.sent).toEqual([{ type: 'subscribe', channel: 'positions' }]);
    });
  });

  describe('estado igual entre as abas', () => {
    it('propaga a queda e o welcome da reconexão a todas', () => {
      const { socket, first, second } = twoTabs();
      first.clear();
      second.clear();

      socket.drop();
      vi.advanceTimersByTime(1000);
      FakeWebSocket.last.open();
      FakeWebSocket.last.receive(welcome());

      for (const tab of [first, second]) {
        expect(tab.statuses).toEqual(['reconnecting', 'connected']);
        expect(tab.messages).toEqual([welcome()]);
      }
    });

    it('limpa as assinaturas na queda e aceita refazê-las', () => {
      const { socket, first } = connected();
      subscribeBook(first, 'ALFA3');
      socket.drop();
      vi.advanceTimersByTime(1000);
      const next = FakeWebSocket.last;
      next.open();
      next.receive(welcome());
      first.clear();

      next.receive({ type: 'book', timestamp: 1, data: book('ALFA3') });
      expect(first.messages).toEqual([]);

      subscribeBook(first, 'ALFA3');
      next.receive({ type: 'book', timestamp: 2, data: book('ALFA3') });
      expect(first.messages).toEqual([{ type: 'book', timestamp: 2, data: book('ALFA3') }]);
    });

    it('descarta o que for enviado sem conexão', () => {
      const { socket, first } = connected();
      socket.drop();
      socket.sent.length = 0;

      subscribeBook(first, 'ALFA3');

      expect(FakeWebSocket.last.sent).toEqual([]);
    });
  });

  describe('frame original', () => {
    it('entrega o book com o texto exato do servidor, só a quem assinou', () => {
      const { socket, first, second } = twoTabs();
      subscribeBook(first, 'ALFA3');
      first.clear();
      second.clear();
      const frame = JSON.stringify({ type: 'book', timestamp: 1, data: book('ALFA3') }, null, 1);

      socket.receiveFrame(frame);

      expect(first.frames).toEqual([{ type: 'frame', frame, key: 'book:ALFA3' }]);
      expect(second.posts).toEqual([]);
    });

    it('não dá chave de substituição aos candles', () => {
      const { socket, first } = connected();
      first.send({ type: 'subscribe', channel: 'candle', symbols: ['ALFA3'] });
      first.clear();
      const message = candleMessage('ALFA3', candle(60_000));

      socket.receive(message);

      expect(first.frames).toEqual([{ type: 'frame', frame: JSON.stringify(message), key: null }]);
    });

    it('usa o canal como chave em positions e account', () => {
      const { socket, first } = connected();
      first.send({ type: 'subscribe', channel: 'account' });
      first.send({ type: 'subscribe', channel: 'positions' });
      first.clear();

      socket.receive(accountMessage());
      socket.receive(positionsMessage());

      expect(first.frames.map(({ key }) => key)).toEqual(['account', 'positions']);
    });

    it('entrega a cotação de um ativo só às abas que o assinaram', () => {
      const { socket, first, second } = twoTabs();
      first.send({ type: 'subscribe', channel: 'quote', symbols: ['ALFA3'] });
      second.send({ type: 'subscribe', channel: 'quote', symbols: ['BETA4'] });
      first.clear();
      second.clear();

      socket.receive(quoteMessage('ALFA3'));

      expect(first.frames.map(({ key }) => key)).toEqual(['quote:ALFA3']);
      expect(second.posts).toEqual([]);
    });

    it('mantém como objeto as cotações com vários ativos', () => {
      const { socket, first } = connected();
      first.send({ type: 'subscribe', channel: 'quote' });
      first.clear();

      socket.receive({ type: 'quotes', timestamp: 1, data: [quote('ALFA3'), quote('BETA4')] });

      expect(first.frames).toEqual([]);
      expect(first.messages).toHaveLength(1);
    });

    it('não entrega frames inválidos', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { socket, first } = connected();
      first.clear();

      socket.receiveFrame('isto não é json');

      expect(first.posts).toEqual([]);
      vi.restoreAllMocks();
    });
  });

  describe('entrega somente do que a aba assinou', () => {
    it('entrega o book apenas às abas que assinaram o ativo', () => {
      const { socket, first, second } = twoTabs();
      subscribeBook(first, 'ALFA3');
      subscribeBook(second, 'BETA4');
      first.clear();
      second.clear();
      const message: ServerMessage = { type: 'book', timestamp: 1, data: book('BETA4') };

      socket.receive(message);

      expect(first.messages).toEqual([]);
      expect(second.messages).toEqual([message]);
    });

    it('entrega às duas abas quando as duas assinaram o mesmo ativo', () => {
      const { socket, first, second } = twoTabs();
      subscribeBook(first, 'ALFA3');
      subscribeBook(second, 'ALFA3');
      first.clear();
      second.clear();
      const message: ServerMessage = { type: 'book', timestamp: 1, data: book('ALFA3') };

      socket.receive(message);

      expect(first.messages).toEqual([message]);
      expect(second.messages).toEqual([message]);
    });

    it('filtra as cotações pelos ativos de cada aba', () => {
      const { socket, first, second } = twoTabs();
      first.send({ type: 'subscribe', channel: 'quote' });
      second.send({ type: 'subscribe', channel: 'quote', symbols: ['BETA4'] });
      first.clear();
      second.clear();
      const data = [quote('ALFA3'), quote('BETA4')];

      socket.receive({ type: 'quotes', timestamp: 1, data });

      expect(first.messages).toEqual([{ type: 'quotes', timestamp: 1, data }]);
      expect(second.messages).toEqual([{ type: 'quotes', timestamp: 1, data: [quote('BETA4')] }]);
    });

    it('entrega subscribed às abas que têm o canal', () => {
      const { socket, first, second } = twoTabs();
      subscribeBook(first, 'ALFA3');
      first.clear();
      second.clear();
      const message: ServerMessage = { type: 'subscribed', channel: 'book', symbols: ['ALFA3'] };

      socket.receive(message);

      expect(first.messages).toEqual([message]);
      expect(second.messages).toEqual([]);
    });

    it('entrega account e positions somente a quem assinou', () => {
      const { socket, first, second } = twoTabs();
      first.send({ type: 'subscribe', channel: 'account' });
      first.clear();
      second.clear();
      const message: ServerMessage = {
        type: 'account',
        timestamp: 1,
        data: { accountId: 'SIM-0001', availableBalance: 1, blockedBalance: 2, totalEquity: 3 },
      };

      socket.receive(message);

      expect(first.messages).toEqual([message]);
      expect(second.messages).toEqual([]);
    });

    it('entrega error sem requestId a todas as abas', () => {
      const { socket, first, second } = twoTabs();
      first.clear();
      second.clear();
      const message: ServerMessage = { type: 'error', code: 'UNKNOWN_SYMBOL', message: 'x' };

      socket.receive(message);

      expect(first.messages).toEqual([message]);
      expect(second.messages).toEqual([message]);
    });
  });

  describe('cancelamento compartilhado', () => {
    it('não cancela no servidor um ativo usado por outra aba', () => {
      const { socket, first, second } = twoTabs();
      subscribeBook(first, 'ALFA3');
      subscribeBook(second, 'ALFA3');
      socket.sent.length = 0;
      first.clear();

      first.send({ type: 'unsubscribe', channel: 'book', symbols: ['ALFA3'] });

      expect(socket.sent).toEqual([]);
      expect(first.messages).toEqual([{ type: 'unsubscribed', channel: 'book', symbols: ['ALFA3'] }]);

      second.clear();
      const message: ServerMessage = { type: 'book', timestamp: 1, data: book('ALFA3') };
      socket.receive(message);
      expect(second.messages).toEqual([message]);
    });

    it('cancela no servidor quando a última aba cancela', () => {
      const { socket, first } = twoTabs();
      subscribeBook(first, 'ALFA3');
      socket.sent.length = 0;

      first.send({ type: 'unsubscribe', channel: 'book', symbols: ['ALFA3'] });

      expect(socket.sent).toEqual([{ type: 'unsubscribe', channel: 'book', symbols: ['ALFA3'] }]);
    });

    it('cancela canais sem ativo só quando ninguém mais os usa', () => {
      const { socket, first, second } = twoTabs();
      first.send({ type: 'subscribe', channel: 'account' });
      second.send({ type: 'subscribe', channel: 'account' });
      socket.sent.length = 0;

      first.send({ type: 'unsubscribe', channel: 'account' });
      expect(socket.sent).toEqual([]);

      second.send({ type: 'unsubscribe', channel: 'account' });
      expect(socket.sent).toEqual([{ type: 'unsubscribe', channel: 'account' }]);
    });

    it('não repassa ao servidor o unsubscribed dele', () => {
      const { socket, first } = connected();
      first.clear();

      socket.receive({ type: 'unsubscribed', channel: 'book', symbols: ['ALFA3'] });

      expect(first.messages).toEqual([]);
    });

    it('cancela as assinaturas exclusivas da aba que sai', () => {
      const { socket, first, second } = twoTabs();
      subscribeBook(first, 'ALFA3');
      subscribeBook(second, 'ALFA3');
      subscribeBook(second, 'BETA4');
      socket.sent.length = 0;

      second.detach();

      expect(socket.sent).toEqual([{ type: 'unsubscribe', channel: 'book', symbols: ['BETA4'] }]);
      expect(second.closed).toBe(true);
    });
  });

  describe('respostas com requestId', () => {
    function candlesRequest(symbol: string): ClientMessage {
      return { type: 'getCandles', requestId: 'candles-1', symbol, limit: 120 };
    }

    function candlesResponse(requestId: string, symbol: string): ServerMessage {
      return {
        type: 'candles',
        requestId,
        timestamp: 1,
        data: { symbol, interval: '1m', candles: [] },
      };
    }

    it('devolve a cada aba só a própria resposta, com o requestId original', () => {
      const { socket, first, second } = twoTabs();
      first.send(candlesRequest('ALFA3'));
      second.send(candlesRequest('BETA4'));
      first.clear();
      second.clear();
      const [fromFirst, fromSecond] = socket.sent.slice(-2) as { requestId: string }[];
      expect(fromFirst.requestId).not.toBe(fromSecond.requestId);

      socket.receive(candlesResponse(fromSecond.requestId, 'BETA4'));
      socket.receive(candlesResponse(fromFirst.requestId, 'ALFA3'));

      expect(first.messages).toEqual([candlesResponse('candles-1', 'ALFA3')]);
      expect(second.messages).toEqual([candlesResponse('candles-1', 'BETA4')]);
    });

    it('devolve o erro com requestId só à aba que consultou', () => {
      const { socket, first, second } = twoTabs();
      first.send(candlesRequest('XXXX'));
      first.clear();
      second.clear();
      const { requestId } = socket.sent.at(-1) as { requestId: string };

      socket.receive({ type: 'error', code: 'UNKNOWN_SYMBOL', message: 'x', requestId });

      expect(first.messages).toEqual([
        { type: 'error', code: 'UNKNOWN_SYMBOL', message: 'x', requestId: 'candles-1' },
      ]);
      expect(second.messages).toEqual([]);
    });

    it('descarta a resposta de uma aba que já saiu', () => {
      const { socket, first, second } = twoTabs();
      first.send(candlesRequest('ALFA3'));
      const { requestId } = socket.sent.at(-1) as { requestId: string };
      first.detach();
      second.clear();

      socket.receive(candlesResponse(requestId, 'ALFA3'));

      expect(second.messages).toEqual([]);
    });
  });

  describe('aba encerrada sem aviso', () => {
    let exits: Map<string, () => void>;

    beforeEach(() => {
      exits = new Map();
      hub = new MarketHub((lock, onExit) => exits.set(lock, onExit));
    });

    it('espera a trava informada pela aba', () => {
      new FakeTab(hub).attach('trava-1');

      expect([...exits.keys()]).toEqual(['trava-1']);
    });

    it('libera as assinaturas exclusivas quando a trava é liberada', () => {
      const first = new FakeTab(hub).attach('trava-1');
      const socket = FakeWebSocket.last;
      socket.open();
      socket.receive(welcome());
      const second = new FakeTab(hub).attach('trava-2');
      second.send({ type: 'subscribe', channel: 'positions' });
      socket.sent.length = 0;

      exits.get('trava-2')?.();

      expect(socket.sent).toEqual([{ type: 'unsubscribe', channel: 'positions' }]);
      expect(second.closed).toBe(true);
      expect(first.closed).toBe(false);
    });

    it('fecha o socket quando a última aba some sem avisar', () => {
      new FakeTab(hub).attach('trava-1');
      const socket = FakeWebSocket.last;
      socket.open();
      socket.receive(welcome());

      exits.get('trava-1')?.();

      expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    });

    it('não libera duas vezes depois de um detach explícito', () => {
      const first = new FakeTab(hub).attach('trava-1');
      const socket = FakeWebSocket.last;
      socket.open();
      socket.receive(welcome());
      const second = new FakeTab(hub).attach('trava-2');
      second.send({ type: 'subscribe', channel: 'positions' });
      second.detach();
      socket.sent.length = 0;

      exits.get('trava-2')?.();

      expect(socket.sent).toEqual([]);
      expect(first.closed).toBe(false);
    });
  });

  describe('encerramento', () => {
    it('fecha o socket com código 1000 quando a última aba sai', () => {
      const { socket, first } = connected();

      first.detach();
      vi.advanceTimersByTime(120_000);

      expect(socket.closeCode).toBe(1000);
      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('mantém o socket enquanto restar uma aba', () => {
      const { socket, first, second } = twoTabs();

      first.detach();

      expect(socket.closeCode).toBeUndefined();
      expect(second.closed).toBe(false);
    });

    it('cancela a tentativa pendente quando a última aba sai durante a espera', () => {
      const { socket, first } = connected();
      socket.drop();

      first.detach();
      vi.advanceTimersByTime(120_000);

      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('abre uma nova conexão se outra aba entrar depois que todas saíram', () => {
      connected().first.detach();

      new FakeTab(hub).attach();

      expect(FakeWebSocket.instances).toHaveLength(2);
    });
  });
});
