import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { ServerMessage } from '../market-protocol';
import { bookMessage, candle, candleMessage, quoteMessage, welcome } from '../testing/market-fixtures';
import { MarketConnectionFactory, UnavailableMarketConnection } from './market-connection';
import { SharedWorkerMarketConnection } from './shared-worker-market-connection';
import type { ConnectionStatus, TabToWorkerMessage } from './worker-messages';

class FakeSharedWorker {
  static instances: FakeSharedWorker[] = [];

  onerror: (() => void) | null = null;
  readonly posts: TabToWorkerMessage[] = [];
  readonly port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (message: TabToWorkerMessage) => this.posts.push(message),
  };

  constructor() {
    FakeSharedWorker.instances.push(this);
  }

  emit(data: unknown): void {
    this.port.onmessage?.({ data });
  }
}

function pageEvent(type: string, persisted: boolean): Event {
  return Object.assign(new Event(type), { persisted });
}

describe('MarketConnectionFactory', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cria a conexão pelo SharedWorker quando o navegador oferece o recurso', () => {
    vi.stubGlobal('SharedWorker', FakeSharedWorker);

    const connection = TestBed.inject(MarketConnectionFactory).create('ws://teste');

    expect(connection).toBeInstanceOf(SharedWorkerMarketConnection);
  });

  it('renderiza logo depois de aplicar os frames de um quadro', () => {
    vi.stubGlobal('SharedWorker', FakeSharedWorker);
    let runFrame: FrameRequestCallback = () => undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      runFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const tick = vi.spyOn(TestBed.inject(ApplicationRef), 'tick');
    const connection = TestBed.inject(MarketConnectionFactory).create('ws://teste');
    connection.open();
    FakeSharedWorker.instances.at(-1)?.emit({
      type: 'frame',
      frame: JSON.stringify(bookMessage('ALFA3')),
      key: 'book:ALFA3',
    });
    expect(tick).not.toHaveBeenCalled();

    runFrame(0);

    expect(tick).toHaveBeenCalledTimes(1);
    connection.close();
  });

  it('cria uma conexão indisponível sem SharedWorker', () => {
    vi.stubGlobal('SharedWorker', undefined);

    const connection = TestBed.inject(MarketConnectionFactory).create('ws://teste');
    const statuses: ConnectionStatus[] = [];
    connection.status.subscribe((status) => statuses.push(status));
    connection.open();

    expect(connection).toBeInstanceOf(UnavailableMarketConnection);
    expect(statuses).toEqual(['unavailable']);
  });
});

describe('SharedWorkerMarketConnection', () => {
  let connection: SharedWorkerMarketConnection;
  let statuses: ConnectionStatus[];
  let messages: ServerMessage[];

  function open(createWorker = () => new FakeSharedWorker()): void {
    connection = new SharedWorkerMarketConnection(
      'ws://teste',
      createWorker as unknown as () => SharedWorker,
    );
    connection.status.subscribe((status) => statuses.push(status));
    connection.messages.subscribe((message) => messages.push(message));
    connection.open();
  }

  function worker(): FakeSharedWorker {
    return FakeSharedWorker.instances[FakeSharedWorker.instances.length - 1];
  }

  beforeEach(() => {
    FakeSharedWorker.instances = [];
    statuses = [];
    messages = [];
  });

  afterEach(() => connection.close());

  it('se apresenta ao worker com a URL', () => {
    open();

    expect(worker().posts).toEqual([{ type: 'attach', url: 'ws://teste' }]);
  });

  it('repassa estado e mensagens recebidos do worker', () => {
    open();
    const message: ServerMessage = { type: 'welcome', channels: [], symbols: [] };

    worker().emit({ type: 'status', status: 'connected' });
    worker().emit({ type: 'message', message });

    expect(statuses).toEqual(['connected']);
    expect(messages).toEqual([message]);
  });

  it('envia as mensagens da aba', () => {
    open();

    connection.send({ type: 'subscribe', channel: 'quote' });

    expect(worker().posts.at(-1)).toEqual({
      type: 'send',
      message: { type: 'subscribe', channel: 'quote' },
    });
  });

  it('avisa o worker em close e deixa de receber mensagens', () => {
    open();
    const current = worker();

    connection.close();
    current.emit({ type: 'status', status: 'connected' });

    expect(current.posts.at(-1)).toEqual({ type: 'detach' });
    expect(statuses).toEqual([]);
  });

  describe('com Web Locks', () => {
    let granted: { name: string; result: unknown }[];
    let pendingCallbacks: { name: string; run: () => unknown }[];

    beforeEach(() => {
      granted = [];
      pendingCallbacks = [];
      vi.stubGlobal('navigator', {
        locks: {
          request: (name: string, callback: () => unknown) => {
            pendingCallbacks.push({ name, run: () => {
              const result = callback();
              granted.push({ name, result });
              return result;
            } });
            return Promise.resolve();
          },
        },
      });
    });

    afterEach(() => vi.unstubAllGlobals());

    it('só se apresenta depois de obter a trava e a informa ao worker', () => {
      open();
      expect(worker().posts).toEqual([]);

      pendingCallbacks[0].run();

      expect(worker().posts).toEqual([
        { type: 'attach', url: 'ws://teste', lock: pendingCallbacks[0].name },
      ]);
    });

    it('não se apresenta se a aba saiu antes de obter a trava', () => {
      open();
      const current = worker();
      connection.close();
      current.posts.length = 0;

      pendingCallbacks[0].run();

      expect(current.posts).toEqual([]);
      expect(granted[0].result).toBeUndefined();
    });

    it('libera a trava ao se despedir do worker', async () => {
      open();
      pendingCallbacks[0].run();
      let released = false;
      void (granted[0].result as Promise<void>).then(() => (released = true));

      connection.close();
      await Promise.resolve();

      expect(released).toBe(true);
    });
  });

  describe('agrupamento por quadro', () => {
    let pendingFrames: Map<number, FrameRequestCallback>;
    let afterFlush: ReturnType<typeof vi.fn>;

    function emitFrame(message: ServerMessage, key: string | null): void {
      worker().emit({ type: 'frame', frame: JSON.stringify(message), key });
    }

    function runFrame(): void {
      const callbacks = [...pendingFrames.values()];
      pendingFrames.clear();
      callbacks.forEach((callback) => callback(0));
    }

    beforeEach(() => {
      vi.useFakeTimers();
      pendingFrames = new Map();
      let nextId = 0;
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        pendingFrames.set(++nextId, callback);
        return nextId;
      });
      vi.stubGlobal('cancelAnimationFrame', (id: number) => pendingFrames.delete(id));
      afterFlush = vi.fn();
      open();
    });

    afterEach(() => {
      connection.close();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    function open(): void {
      connection = new SharedWorkerMarketConnection(
        'ws://teste',
        (() => new FakeSharedWorker()) as unknown as () => SharedWorker,
        afterFlush as () => void,
      );
      connection.status.subscribe((status) => statuses.push(status));
      connection.messages.subscribe((message) => messages.push(message));
      connection.open();
    }

    it('não aplica nada antes do quadro', () => {
      emitFrame(bookMessage('ALFA3'), 'book:ALFA3');

      expect(messages).toEqual([]);
    });

    it('aplica só o book mais recente de cada ativo', () => {
      const latest = bookMessage('ALFA3', { spread: 9 });

      emitFrame(bookMessage('ALFA3', { spread: 1 }), 'book:ALFA3');
      emitFrame(latest, 'book:ALFA3');
      runFrame();

      expect(messages).toEqual([latest]);
    });

    it('aplica as cotações de ativos diferentes', () => {
      const alfa = quoteMessage('ALFA3');
      const beta = quoteMessage('BETA4');

      emitFrame(alfa, 'quote:ALFA3');
      emitFrame(beta, 'quote:BETA4');
      runFrame();

      expect(messages).toEqual([alfa, beta]);
    });

    it('aplica cada mensagem no quadro seguinte à sua chegada', () => {
      const first = bookMessage('ALFA3', { spread: 1 });
      const second = bookMessage('ALFA3', { spread: 2 });

      emitFrame(first, 'book:ALFA3');
      runFrame();
      emitFrame(second, 'book:ALFA3');
      runFrame();

      expect(messages).toEqual([first, second]);
    });

    it('aplica todos os candles do quadro, na ordem de chegada', () => {
      const candles = [1, 2, 3].map((close) => candleMessage('ALFA3', candle(60_000, { close })));

      candles.forEach((message) => emitFrame(message, null));
      runFrame();

      expect(messages).toEqual(candles);
    });

    it('aplica os pendentes antes de uma queda', () => {
      const order: string[] = [];
      connection.messages.subscribe((message) => order.push(message.type));
      connection.status.subscribe((status) => order.push(status));

      emitFrame(bookMessage('ALFA3'), 'book:ALFA3');
      worker().emit({ type: 'status', status: 'reconnecting' });

      expect(order).toEqual(['book', 'reconnecting']);
      expect(pendingFrames.size).toBe(0);
    });

    it('aplica os pendentes antes de um welcome', () => {
      const book = bookMessage('ALFA3');
      const hello = welcome();

      emitFrame(book, 'book:ALFA3');
      worker().emit({ type: 'message', message: hello });

      expect(messages).toEqual([book, hello]);
    });

    it('aplica por temporizador quando não há quadros e cancela o quadro agendado', () => {
      const book = bookMessage('ALFA3');

      emitFrame(book, 'book:ALFA3');
      vi.advanceTimersByTime(99);
      expect(messages).toEqual([]);
      vi.advanceTimersByTime(1);

      expect(messages).toEqual([book]);
      expect(pendingFrames.size).toBe(0);
    });

    it('cancela o temporizador quando o quadro chega primeiro', () => {
      const book = bookMessage('ALFA3');

      emitFrame(book, 'book:ALFA3');
      runFrame();
      vi.advanceTimersByTime(1000);

      expect(messages).toEqual([book]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('agenda de novo depois de aplicar', () => {
      emitFrame(bookMessage('ALFA3'), 'book:ALFA3');
      runFrame();

      emitFrame(bookMessage('BETA4'), 'book:BETA4');

      expect(pendingFrames.size).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
    });

    it.each([
      ['close', () => connection.close()],
      ['pagehide', () => window.dispatchEvent(pageEvent('pagehide', false))],
      ['falha de carga', () => worker().onerror?.()],
    ])('descarta os pendentes em %s', (_name, leave) => {
      emitFrame(bookMessage('ALFA3'), 'book:ALFA3');
      emitFrame(candleMessage('ALFA3', candle(60_000)), null);

      leave();
      runFrame();
      vi.advanceTimersByTime(1000);

      expect(messages).toEqual([]);
      expect(pendingFrames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('avisa depois de aplicar pelo quadro', () => {
      const applied: boolean[] = [];
      afterFlush.mockImplementation(() => applied.push(messages.length === 1));

      emitFrame(bookMessage('ALFA3'), 'book:ALFA3');
      runFrame();

      expect(applied).toEqual([true]);
    });

    it('não avisa quando aplica pelo temporizador', () => {
      emitFrame(bookMessage('ALFA3'), 'book:ALFA3');
      vi.advanceTimersByTime(100);

      expect(afterFlush).not.toHaveBeenCalled();
    });

    it('não avisa quando aplica por uma mensagem de controle', () => {
      emitFrame(bookMessage('ALFA3'), 'book:ALFA3');
      worker().emit({ type: 'status', status: 'reconnecting' });

      expect(afterFlush).not.toHaveBeenCalled();
    });
  });

  it('avisa o worker em pagehide', () => {
    open();

    window.dispatchEvent(pageEvent('pagehide', true));

    expect(worker().posts.at(-1)).toEqual({ type: 'detach' });
  });

  it('volta a se apresentar quando a página retorna do bfcache', () => {
    open();
    window.dispatchEvent(pageEvent('pagehide', true));

    window.dispatchEvent(pageEvent('pageshow', true));

    expect(FakeSharedWorker.instances).toHaveLength(2);
    expect(worker().posts).toEqual([{ type: 'attach', url: 'ws://teste' }]);
  });

  it('não cria outro worker em um pageshow comum', () => {
    open();

    window.dispatchEvent(pageEvent('pageshow', false));

    expect(FakeSharedWorker.instances).toHaveLength(1);
  });

  it('fica unavailable quando o worker não carrega', () => {
    open();

    worker().onerror?.();

    expect(statuses).toEqual(['unavailable']);
  });

  it('fica unavailable quando o navegador recusa criar o worker', () => {
    open(() => {
      throw new Error('bloqueado');
    });

    expect(statuses).toEqual(['unavailable']);
  });
});
