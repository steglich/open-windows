import { TestBed } from '@angular/core/testing';

import type { ClientMessage } from './market-protocol';
import { MarketStore } from './market-store';
import { FakeWebSocket } from './testing/fake-web-socket';
import {
  bookMessage,
  portfolio,
  positionsMessage,
  quote,
  quoteMessage,
  startConnected,
  welcome,
} from './testing/market-fixtures';

const BASE_SUBSCRIPTIONS: ClientMessage[] = [
  { type: 'subscribe', channel: 'quote' },
  { type: 'subscribe', channel: 'positions' },
];

describe('MarketStore', () => {
  let store: MarketStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    store = TestBed.inject(MarketStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** Deixa a espera de reconexão passar e leva a nova conexão até o `welcome`. */
  function reconnect(symbols?: readonly string[]): FakeWebSocket {
    vi.advanceTimersByTime(1000);
    const socket = FakeWebSocket.last;
    socket.open();
    socket.receive(welcome(symbols));
    return socket;
  }

  describe('dados em tempo real', () => {
    it('substitui apenas a cotação do ativo recebido', () => {
      const socket = startConnected(store);
      socket.receive(quoteMessage('ALFA3'));
      socket.receive(quoteMessage('BETA4'));

      socket.receive(quoteMessage('ALFA3', { last: 40 }));

      expect(store.quoteRows()).toEqual([quote('ALFA3', { last: 40 }), quote('BETA4')]);
    });

    it('mantém todas as cotações de uma rajada', () => {
      const socket = startConnected(store);

      socket.receive(quoteMessage('GAMA3'));
      socket.receive(quoteMessage('ALFA3'));
      socket.receive(quoteMessage('BETA4'));

      expect(store.quoteRows()).toHaveLength(3);
    });

    it('ordena as cotações pela lista do welcome', () => {
      const socket = startConnected(store);

      socket.receive(quoteMessage('GAMA3'));
      socket.receive(quoteMessage('ALFA3'));

      expect(store.quoteRows().map(({ symbol }) => symbol)).toEqual(['ALFA3', 'GAMA3']);
    });

    it('substitui a carteira inteira', () => {
      const socket = startConnected(store);
      socket.receive(positionsMessage());

      socket.receive(positionsMessage({ positions: [] }));

      expect(store.portfolio()).toEqual(portfolio({ positions: [] }));
    });

    it('guarda o book do ativo selecionado', () => {
      const socket = startConnected(store);

      socket.receive(bookMessage('ALFA3'));

      expect(store.book()?.symbol).toBe('ALFA3');
    });
  });

  describe('queda da conexão', () => {
    it('mantém os dados marcados como desatualizados até o novo welcome', () => {
      const socket = startConnected(store);
      socket.receive(quoteMessage('ALFA3'));
      socket.receive(bookMessage('ALFA3'));
      socket.receive(positionsMessage());
      expect(store.stale()).toBe(false);

      socket.drop();

      expect(store.stale()).toBe(true);
      expect(store.quoteRows()).toHaveLength(1);
      expect(store.book()).not.toBeNull();
      expect(store.portfolio()).not.toBeNull();
    });
  });

  describe('assinaturas', () => {
    it('assina quote, positions e somente o book do ativo selecionado', () => {
      const socket = startConnected(store);

      expect(store.selectedSymbol()).toBe('ALFA3');
      expect(socket.sent).toEqual([
        ...BASE_SUBSCRIPTIONS,
        { type: 'subscribe', channel: 'book', symbols: ['ALFA3'] },
      ]);
    });

    it('refaz as assinaturas no welcome seguinte mantendo o ativo selecionado', () => {
      const first = startConnected(store);
      store.select('BETA4');
      first.drop();

      const second = reconnect();

      expect(store.selectedSymbol()).toBe('BETA4');
      expect(second.sent).toEqual([
        ...BASE_SUBSCRIPTIONS,
        { type: 'subscribe', channel: 'book', symbols: ['BETA4'] },
      ]);
    });

    it('seleciona o primeiro ativo quando o selecionado deixa de existir', () => {
      const first = startConnected(store);
      first.receive(bookMessage('ALFA3'));
      store.select('GAMA3');
      first.receive(bookMessage('GAMA3'));
      first.drop();

      const second = reconnect(['BETA4', 'DELT11']);

      expect(store.selectedSymbol()).toBe('BETA4');
      expect(store.book()).toBeNull();
      expect(second.sent).toContainEqual({
        type: 'subscribe',
        channel: 'book',
        symbols: ['BETA4'],
      });
    });
  });

  describe('troca do ativo selecionado', () => {
    it('cancela o book anterior, assina o novo e limpa o book até o novo chegar', () => {
      const socket = startConnected(store);
      socket.receive(bookMessage('ALFA3'));
      socket.sent = [];

      store.select('BETA4');

      expect(socket.sent).toEqual([
        { type: 'unsubscribe', channel: 'book', symbols: ['ALFA3'] },
        { type: 'subscribe', channel: 'book', symbols: ['BETA4'] },
      ]);
      expect(store.book()).toBeNull();
    });

    it('não envia nada ao selecionar o ativo já selecionado', () => {
      const socket = startConnected(store);
      socket.receive(bookMessage('ALFA3'));
      socket.sent = [];

      store.select('ALFA3');

      expect(socket.sent).toEqual([]);
      expect(store.book()).not.toBeNull();
    });

    it('só muda a seleção quando está sem conexão', () => {
      const socket = startConnected(store);
      socket.drop();
      socket.sent = [];

      store.select('BETA4');

      expect(store.selectedSymbol()).toBe('BETA4');
      expect(socket.sent).toEqual([]);
    });

    it('descarta mensagem atrasada do ativo anterior', () => {
      const socket = startConnected(store);
      store.select('BETA4');

      socket.receive(bookMessage('ALFA3'));

      expect(store.book()).toBeNull();
    });
  });

  describe('erros do servidor', () => {
    const error = { type: 'error', code: 'UNKNOWN_SYMBOL', message: 'Ativo desconhecido.' } as const;

    it('expõe o erro sem afetar a conexão nem os dados', () => {
      const socket = startConnected(store);

      socket.receive(error);
      socket.receive(quoteMessage('ALFA3'));

      expect(store.lastError()).toEqual({ code: error.code, message: error.message });
      expect(store.status()).toBe('connected');
      expect(store.quoteRows()).toHaveLength(1);
    });

    it('limpa o erro no próximo subscribed', () => {
      const socket = startConnected(store);
      socket.receive(error);

      socket.receive({ type: 'subscribed', channel: 'quote', symbols: [] });

      expect(store.lastError()).toBeNull();
    });

    it('limpa o erro no próximo welcome', () => {
      const socket = startConnected(store);
      socket.receive(error);

      socket.receive(welcome());

      expect(store.lastError()).toBeNull();
    });
  });

  describe('início', () => {
    it('abre uma única conexão e não retorna Promise', () => {
      expect(store.start()).toBeUndefined();
      store.start();

      expect(FakeWebSocket.instances).toHaveLength(1);
    });
  });
});
