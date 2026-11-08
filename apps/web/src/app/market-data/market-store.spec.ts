import { TestBed } from '@angular/core/testing';

import type { ClientMessage } from './market-protocol';
import { MarketStore } from './market-store';
import { FakeWebSocket } from './testing/fake-web-socket';
import {
  account,
  accountMessage,
  answerCandles,
  bookMessage,
  candle,
  candleRequests,
  candlesMessage,
  portfolio,
  positionsMessage,
  quote,
  quoteMessage,
  quotesMessage,
  startConnected,
  welcome,
} from './testing/market-fixtures';

const BASE_SUBSCRIPTIONS: ClientMessage[] = [
  { type: 'subscribe', channel: 'quote' },
  { type: 'subscribe', channel: 'positions' },
  { type: 'subscribe', channel: 'account' },
];

function getCandles(requestId: string, symbol: string): ClientMessage {
  return { type: 'getCandles', requestId, symbol, limit: 120 };
}

const MINUTE = 60_000;

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

    it('aplica o lote inteiro e mantém os ativos ausentes dele', () => {
      const socket = startConnected(store);
      socket.receive(quoteMessage('GAMA3', { last: 7 }));

      socket.receive(
        quotesMessage([quote('ALFA3', { last: 40 }), quote('BETA4', { last: 41 })]),
      );

      expect(store.quoteRows()).toEqual([
        quote('ALFA3', { last: 40 }),
        quote('BETA4', { last: 41 }),
        quote('GAMA3', { last: 7 }),
      ]);
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

    it('substitui o saldo inteiro', () => {
      const socket = startConnected(store);
      socket.receive(accountMessage());

      socket.receive(accountMessage({ totalEquity: 2000 }));

      expect(store.account()).toEqual(account({ totalEquity: 2000 }));
    });

    it('expõe a cotação do ativo selecionado', () => {
      const socket = startConnected(store);
      socket.receive(quoteMessage('BETA4', { last: 41 }));
      expect(store.selectedQuote()).toBeNull();

      store.select('BETA4');

      expect(store.selectedQuote()).toEqual(quote('BETA4', { last: 41 }));
    });
  });

  describe('candles do ativo selecionado', () => {
    it('consulta os candles após as assinaturas do welcome', () => {
      const socket = startConnected(store);

      expect(socket.sent.at(-1)).toEqual(getCandles('candles-1', 'ALFA3'));
    });

    it('troca de ativo descarta os candles e consulta o novo', () => {
      const socket = startConnected(store);
      answerCandles(socket, [candle(MINUTE)]);
      socket.sent = [];

      store.select('BETA4');

      expect(store.candles()).toBeNull();
      expect(socket.sent).toEqual([
        { type: 'unsubscribe', channel: 'book', symbols: ['ALFA3'] },
        { type: 'subscribe', channel: 'book', symbols: ['BETA4'] },
        getCandles('candles-2', 'BETA4'),
      ]);
    });

    it('sem conexão, deixa a consulta para o próximo welcome', () => {
      const socket = startConnected(store);
      socket.drop();
      socket.sent = [];

      store.select('BETA4');
      expect(socket.sent).toEqual([]);

      expect(candleRequests(reconnect()).map(({ symbol }) => symbol)).toEqual(['BETA4']);
    });

    it('aplica somente a resposta da consulta mais recente', () => {
      const socket = startConnected(store);
      store.select('BETA4');

      socket.receive(candlesMessage('candles-1', 'ALFA3', [candle(MINUTE)]));
      expect(store.candles()).toBeNull();

      const candles = [candle(MINUTE, { close: 40 })];
      socket.receive(candlesMessage('candles-2', 'BETA4', candles));
      expect(store.candles()).toEqual(candles);
    });

    it('mantém os candles ao reconectar até a nova resposta', () => {
      const first = startConnected(store);
      answerCandles(first, [candle(MINUTE)]);
      first.drop();

      const second = reconnect();
      expect(store.candles()).toEqual([candle(MINUTE)]);

      answerCandles(second, [candle(2 * MINUTE)]);
      expect(store.candles()).toEqual([candle(2 * MINUTE)]);
    });

    it('descarta a resposta de uma consulta anterior à queda', () => {
      const first = startConnected(store);
      first.drop();

      const second = reconnect();

      second.receive(candlesMessage('candles-1', 'ALFA3', [candle(MINUTE)]));
      expect(store.candles()).toBeNull();
    });

    describe('candle em andamento', () => {
      function connectedWithCandles(): FakeWebSocket {
        const socket = startConnected(store);
        answerCandles(socket, [candle(0), candle(MINUTE, { high: 33, low: 31.5 })]);
        return socket;
      }

      it('atualiza fechamento e máxima sem mudar os demais candles', () => {
        const socket = connectedWithCandles();
        const previous = store.candles()?.[0];

        socket.receive(quoteMessage('ALFA3', { last: 33.5, updatedAt: MINUTE + 500 }));

        expect(store.candles()?.[0]).toBe(previous);
        expect(store.candles()?.[1]).toEqual(
          candle(MINUTE, { close: 33.5, high: 33.5, low: 31.5 }),
        );
      });

      it('atualiza fechamento e mínima', () => {
        const socket = connectedWithCandles();

        socket.receive(quoteMessage('ALFA3', { last: 31, updatedAt: MINUTE + 500 }));

        expect(store.candles()?.[1]).toEqual(candle(MINUTE, { close: 31, high: 33, low: 31 }));
      });

      it('mantém o mesmo array quando a cotação não muda o candle', () => {
        const socket = connectedWithCandles();
        const before = store.candles();

        socket.receive(quoteMessage('ALFA3', { last: 32.5, updatedAt: MINUTE + 500 }));

        expect(store.candles()).toBe(before);
      });

      it('ignora cotação de outro ativo', () => {
        const socket = connectedWithCandles();
        const before = store.candles();

        socket.receive(quoteMessage('BETA4', { last: 99, updatedAt: MINUTE + 500 }));

        expect(store.candles()).toBe(before);
      });

      it('ignora cotação de um minuto anterior', () => {
        const socket = connectedWithCandles();
        const before = store.candles();

        socket.receive(quoteMessage('ALFA3', { last: 99, updatedAt: 500 }));

        expect(store.candles()).toBe(before);
      });

      it('reconsulta na virada do minuto mantendo os candles atuais', () => {
        const socket = connectedWithCandles();
        const before = store.candles();
        socket.sent = [];

        socket.receive(quoteMessage('ALFA3', { last: 40, updatedAt: 2 * MINUTE }));

        expect(socket.sent).toEqual([getCandles('candles-2', 'ALFA3')]);
        expect(store.candles()).toBe(before);
      });

      it('não duplica a consulta enquanto uma estiver pendente', () => {
        const socket = connectedWithCandles();
        socket.sent = [];

        socket.receive(quoteMessage('ALFA3', { updatedAt: 2 * MINUTE }));
        socket.receive(quoteMessage('ALFA3', { updatedAt: 2 * MINUTE + 500 }));

        expect(socket.sent).toHaveLength(1);
      });

      it('libera nova consulta depois do erro da consulta pendente', () => {
        const socket = connectedWithCandles();
        socket.sent = [];
        socket.receive(quoteMessage('ALFA3', { updatedAt: 2 * MINUTE }));

        socket.receive({
          type: 'error',
          code: 'UNKNOWN_SYMBOL',
          message: 'Ativo desconhecido.',
          requestId: 'candles-2',
        });
        expect(store.lastError()?.code).toBe('UNKNOWN_SYMBOL');

        socket.receive(quoteMessage('ALFA3', { updatedAt: 2 * MINUTE + 500 }));
        expect(socket.sent).toHaveLength(2);
      });
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
    it('assina quote, positions, account e somente o book do ativo selecionado', () => {
      const socket = startConnected(store);

      expect(store.selectedSymbol()).toBe('ALFA3');
      expect(socket.sent).toEqual([
        ...BASE_SUBSCRIPTIONS,
        { type: 'subscribe', channel: 'book', symbols: ['ALFA3'] },
        getCandles('candles-1', 'ALFA3'),
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
        getCandles('candles-3', 'BETA4'),
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
        getCandles('candles-2', 'BETA4'),
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
