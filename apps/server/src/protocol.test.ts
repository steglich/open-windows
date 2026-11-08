import { describe, expect, it } from 'vitest';

import { parseClientMessage } from './protocol.js';

const symbols = new Set(['PETR4', 'VALE3']);

function parse(value: unknown) {
  return parseClientMessage(JSON.stringify(value), symbols);
}

describe('parseClientMessage', () => {
  it.each(['{não é json', '[]', 'null', '42'])('rejeita o texto %s', (raw) => {
    expect(parseClientMessage(raw, symbols)).toMatchObject({ ok: false, code: 'INVALID_MESSAGE' });
  });

  it('rejeita type desconhecido', () => {
    expect(parse({ type: 'ping', channel: 'quote' })).toMatchObject({
      ok: false,
      code: 'INVALID_MESSAGE',
    });
  });

  it('rejeita mensagem sem canal', () => {
    expect(parse({ type: 'subscribe' })).toMatchObject({ ok: false, code: 'INVALID_MESSAGE' });
  });

  it('rejeita canal desconhecido', () => {
    expect(parse({ type: 'subscribe', channel: 'news' })).toMatchObject({
      ok: false,
      code: 'UNKNOWN_CHANNEL',
    });
  });

  it.each(['PETR4', [1], { 0: 'PETR4' }])('rejeita symbols malformado: %j', (value) => {
    expect(parse({ type: 'subscribe', channel: 'quote', symbols: value })).toMatchObject({
      ok: false,
      code: 'INVALID_MESSAGE',
    });
  });

  it('rejeita a lista inteira quando há um ativo desconhecido', () => {
    expect(parse({ type: 'subscribe', channel: 'book', symbols: ['PETR4', 'XPTO9'] })).toMatchObject({
      ok: false,
      code: 'UNKNOWN_SYMBOL',
    });
  });

  it('aceita assinatura de ativos específicos', () => {
    expect(parse({ type: 'subscribe', channel: 'quote', symbols: ['PETR4'] })).toEqual({
      ok: true,
      message: { type: 'subscribe', channel: 'quote', symbols: ['PETR4'] },
    });
  });

  it('aceita cancelamento sem symbols', () => {
    expect(parse({ type: 'unsubscribe', channel: 'book' })).toEqual({
      ok: true,
      message: { type: 'unsubscribe', channel: 'book' },
    });
  });

  it('aceita o canal candle com e sem symbols', () => {
    expect(parse({ type: 'subscribe', channel: 'candle', symbols: ['PETR4'] })).toEqual({
      ok: true,
      message: { type: 'subscribe', channel: 'candle', symbols: ['PETR4'] },
    });
    expect(parse({ type: 'subscribe', channel: 'candle' })).toEqual({
      ok: true,
      message: { type: 'subscribe', channel: 'candle' },
    });
  });

  it('rejeita o envio de ordem como tipo desconhecido', () => {
    expect(parse({ type: 'placeOrder', symbol: 'PETR4', quantity: 100 })).toMatchObject({
      ok: false,
      code: 'INVALID_MESSAGE',
    });
  });

  it('aceita a assinatura do canal account e ignora symbols', () => {
    expect(parse({ type: 'subscribe', channel: 'account', symbols: ['XPTO9'] })).toEqual({
      ok: true,
      message: { type: 'subscribe', channel: 'account' },
    });
  });

  it('ignora symbols no canal positions', () => {
    expect(parse({ type: 'subscribe', channel: 'positions', symbols: ['XPTO9'] })).toEqual({
      ok: true,
      message: { type: 'subscribe', channel: 'positions' },
    });
  });

  describe.each(['getCandles', 'getOrders'])('requestId em %s', (type) => {
    it.each([undefined, '', 7])('rejeita o valor %j', (requestId) => {
      expect(parse({ type, requestId, symbol: 'PETR4' })).toMatchObject({
        ok: false,
        code: 'INVALID_MESSAGE',
      });
    });
  });

  describe('getCandles', () => {
    it('aplica o limite padrão', () => {
      expect(parse({ type: 'getCandles', requestId: 'a', symbol: 'PETR4' })).toEqual({
        ok: true,
        message: { type: 'getCandles', requestId: 'a', symbol: 'PETR4', limit: 390 },
      });
    });

    it('aceita limit e before', () => {
      expect(
        parse({ type: 'getCandles', requestId: 'a', symbol: 'PETR4', limit: 3000, before: 123 }),
      ).toEqual({
        ok: true,
        message: { type: 'getCandles', requestId: 'a', symbol: 'PETR4', limit: 3000, before: 123 },
      });
    });

    it('rejeita ativo desconhecido com o requestId', () => {
      expect(parse({ type: 'getCandles', requestId: 'a', symbol: 'XXXX9' })).toMatchObject({
        ok: false,
        code: 'UNKNOWN_SYMBOL',
        requestId: 'a',
      });
    });

    it.each([
      ['symbol ausente', {}],
      ['limit zero', { symbol: 'PETR4', limit: 0 }],
      ['limit acima do máximo', { symbol: 'PETR4', limit: 5000 }],
      ['limit fracionário', { symbol: 'PETR4', limit: 1.5 }],
      ['before de texto', { symbol: 'PETR4', before: 'ontem' }],
    ])('rejeita %s com o requestId', (_name, fields) => {
      expect(parse({ type: 'getCandles', requestId: 'a', ...fields })).toMatchObject({
        ok: false,
        code: 'INVALID_MESSAGE',
        requestId: 'a',
      });
    });
  });

  describe('getOrders', () => {
    it('aplica offset e limit padrão', () => {
      expect(parse({ type: 'getOrders', requestId: 'b' })).toEqual({
        ok: true,
        message: { type: 'getOrders', requestId: 'b', offset: 0, limit: 100 },
      });
    });

    it('aceita filtros e paginação', () => {
      const message = {
        type: 'getOrders',
        requestId: 'b',
        status: 'PARTIALLY_FILLED',
        symbol: 'VALE3',
        offset: 100,
        limit: 500,
      };
      expect(parse(message)).toEqual({ ok: true, message });
    });

    it('rejeita ativo desconhecido com o requestId', () => {
      expect(parse({ type: 'getOrders', requestId: 'b', symbol: 'XXXX9' })).toMatchObject({
        ok: false,
        code: 'UNKNOWN_SYMBOL',
        requestId: 'b',
      });
    });

    it.each([
      ['status desconhecido', { status: 'PENDING' }],
      ['offset negativo', { offset: -1 }],
      ['limit zero', { limit: 0 }],
      ['limit acima do máximo', { limit: 501 }],
      ['symbol numérico', { symbol: 3 }],
    ])('rejeita %s com o requestId', (_name, fields) => {
      expect(parse({ type: 'getOrders', requestId: 'b', ...fields })).toMatchObject({
        ok: false,
        code: 'INVALID_MESSAGE',
        requestId: 'b',
      });
    });
  });
});
