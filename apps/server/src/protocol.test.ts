import { describe, expect, it } from 'vitest';

import { parseClientMessage } from './protocol.js';

const symbols = new Set(['ALFA3', 'BETA4']);

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

  it.each(['ALFA3', [1], { 0: 'ALFA3' }])('rejeita symbols malformado: %j', (value) => {
    expect(parse({ type: 'subscribe', channel: 'quote', symbols: value })).toMatchObject({
      ok: false,
      code: 'INVALID_MESSAGE',
    });
  });

  it('rejeita a lista inteira quando há um ativo desconhecido', () => {
    expect(parse({ type: 'subscribe', channel: 'book', symbols: ['ALFA3', 'XPTO9'] })).toMatchObject({
      ok: false,
      code: 'UNKNOWN_SYMBOL',
    });
  });

  it('aceita assinatura de ativos específicos', () => {
    expect(parse({ type: 'subscribe', channel: 'quote', symbols: ['ALFA3'] })).toEqual({
      ok: true,
      message: { type: 'subscribe', channel: 'quote', symbols: ['ALFA3'] },
    });
  });

  it('aceita cancelamento sem symbols', () => {
    expect(parse({ type: 'unsubscribe', channel: 'book' })).toEqual({
      ok: true,
      message: { type: 'unsubscribe', channel: 'book' },
    });
  });

  it('ignora symbols no canal positions', () => {
    expect(parse({ type: 'subscribe', channel: 'positions', symbols: ['XPTO9'] })).toEqual({
      ok: true,
      message: { type: 'subscribe', channel: 'positions' },
    });
  });
});
