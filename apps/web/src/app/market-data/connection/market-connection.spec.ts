import { TestBed } from '@angular/core/testing';

import type { ServerMessage } from '../market-protocol';
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
