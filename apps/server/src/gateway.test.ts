import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_TICK_INTERVAL_MS, startGateway, type Gateway } from './gateway.js';
import { seededRandom, TestClient, type ReceivedMessage } from './test-utils.js';

const NEVER_TICKS_MS = 3_600_000;
const FAST_TICK_MS = 5;

let gateway: Gateway;
const clients: TestClient[] = [];

async function start(tickIntervalMs: number): Promise<void> {
  gateway = await startGateway({
    port: 0,
    host: '127.0.0.1',
    tickIntervalMs,
    random: seededRandom(11),
  });
}

/** Conecta um cliente e consome o `welcome`. */
async function connect(): Promise<TestClient> {
  const client = await TestClient.connect(gateway.port);
  clients.push(client);
  await client.waitForType('welcome');
  return client;
}

async function subscribe(client: TestClient, channel: string, symbols?: string[]): Promise<void> {
  client.send({ type: 'subscribe', channel, symbols });
  await client.waitForType('subscribed');
}

const isType = (type: string) => (message: ReceivedMessage) => message.type === type;

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await gateway.close();
});

describe('conexão e protocolo', () => {
  it('envia welcome como primeira mensagem', async () => {
    await start(NEVER_TICKS_MS);
    const client = await TestClient.connect(gateway.port);
    clients.push(client);

    const welcome = await client.waitFor(() => true);

    expect(welcome.type).toBe('welcome');
    expect(welcome.channels).toEqual(['quote', 'book', 'positions']);
    expect(welcome.symbols.length).toBeGreaterThanOrEqual(5);
  });

  it('não envia dados sem assinatura', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();

    await delay(FAST_TICK_MS * 10);

    expect(client.messages.map(({ type }) => type)).toEqual(['welcome']);
  });

  it('confirma a assinatura e envia o estado atual em seguida', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.send({ type: 'subscribe', channel: 'quote', symbols: ['ALFA3'] });

    expect(await client.waitFor(() => true)).toEqual({
      type: 'subscribed',
      channel: 'quote',
      symbols: ['ALFA3'],
    });
    const quote = await client.waitFor(() => true);
    expect(quote.type).toBe('quote');
    expect(quote.data.symbol).toBe('ALFA3');
    expect(typeof quote.timestamp).toBe('number');
  });

  it('assina todos os ativos quando symbols está ausente', async () => {
    await start(NEVER_TICKS_MS);
    const client = await TestClient.connect(gateway.port);
    clients.push(client);
    const { symbols } = await client.waitForType('welcome');

    client.send({ type: 'subscribe', channel: 'book' });
    const books = await client.collect(symbols.length, isType('book'));

    expect(books.map(({ data }) => data.symbol).sort()).toEqual([...symbols].sort());
  });

  it('acumula assinaturas e publica apenas os ativos assinados', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();

    await subscribe(client, 'quote', ['ALFA3']);
    await subscribe(client, 'quote', ['BETA4']);
    const quotes = await client.collect(20, isType('quote'));

    expect(new Set(quotes.map(({ data }) => data.symbol))).toEqual(new Set(['ALFA3', 'BETA4']));
  });

  it('cancela um ativo e mantém os demais', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();
    await subscribe(client, 'quote', ['ALFA3', 'BETA4']);

    client.send({ type: 'unsubscribe', channel: 'quote', symbols: ['ALFA3'] });
    await client.waitForType('unsubscribed');
    const quotes = await client.collect(10, isType('quote'));

    expect(quotes.every(({ data }) => data.symbol === 'BETA4')).toBe(true);
  });

  it('cancela o canal inteiro', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();
    await subscribe(client, 'positions');
    await client.waitForType('positions');

    client.send({ type: 'unsubscribe', channel: 'positions' });
    await client.waitForType('unsubscribed');
    const received = client.messages.length;
    await delay(FAST_TICK_MS * 10);

    expect(client.messages.length).toBe(received);
  });
});

describe('mensagens inválidas', () => {
  it.each([
    ['JSON malformado', '{oops', 'INVALID_MESSAGE'],
    ['type desconhecido', '{"type":"ping"}', 'INVALID_MESSAGE'],
    ['canal desconhecido', '{"type":"subscribe","channel":"news"}', 'UNKNOWN_CHANNEL'],
    [
      'ativo desconhecido',
      '{"type":"subscribe","channel":"quote","symbols":["ALFA3","XPTO9"]}',
      'UNKNOWN_SYMBOL',
    ],
  ])('responde erro e mantém a conexão: %s', async (_name, raw, code) => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.sendRaw(raw);

    expect(await client.waitForType('error')).toMatchObject({ code });
    await subscribe(client, 'positions');
  });

  it('rejeita frames binários', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.sendRaw(Buffer.from('{"type":"subscribe","channel":"book"}'));

    expect(await client.waitForType('error')).toMatchObject({ code: 'INVALID_MESSAGE' });
  });

  it('não assina nenhum ativo de uma lista com ativo desconhecido', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();

    client.send({ type: 'subscribe', channel: 'quote', symbols: ['ALFA3', 'XPTO9'] });
    await client.waitForType('error');
    await delay(FAST_TICK_MS * 10);

    expect(client.messages.some(isType('quote'))).toBe(false);
  });

  it('mantém as assinaturas existentes após um erro', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();
    await subscribe(client, 'quote', ['ALFA3']);

    client.sendRaw('{oops');
    await client.waitForType('error');

    await client.collect(3, isType('quote'));
  });

  it('fecha apenas a conexão que excede o limite de tamanho', async () => {
    await start(FAST_TICK_MS);
    const offender = await connect();
    const other = await connect();
    await subscribe(other, 'quote', ['ALFA3']);

    offender.sendRaw('x'.repeat(16 * 1024 + 1));

    expect(await offender.closed).toBe(1009);
    await other.collect(3, isType('quote'));
  });
});

describe('publicação', () => {
  it('publica a cotação antes do book e com as mesmas melhores ofertas', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();
    await subscribe(client, 'quote', ['ALFA3']);
    await subscribe(client, 'book', ['ALFA3']);

    await client.collect(20, isType('book'));

    let lastQuote: ReceivedMessage | undefined;
    for (const message of client.messages) {
      if (message.type === 'quote') {
        lastQuote = message;
      } else if (message.type === 'book' && lastQuote) {
        expect(message.data.bids[0].price).toBe(lastQuote.data.bid);
        expect(message.data.asks[0].price).toBe(lastQuote.data.ask);
      }
    }
    expect(lastQuote).toBeDefined();
  });

  it('avalia as posições pelo último preço publicado', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();
    await subscribe(client, 'quote');
    await subscribe(client, 'positions');

    await client.collect(10, isType('positions'));

    const lastBySymbol = new Map<string, number>();
    for (const message of client.messages) {
      if (message.type === 'quote') {
        lastBySymbol.set(message.data.symbol, message.data.last);
      } else if (message.type === 'positions') {
        for (const { symbol, lastPrice } of message.data.positions) {
          expect(lastPrice).toBe(lastBySymbol.get(symbol));
        }
      }
    }
  });

  it('publica posições a cada dois ciclos', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();
    await subscribe(client, 'quote', ['ALFA3']);
    await subscribe(client, 'positions');

    await client.collect(41, isType('quote'));
    const count = client.messages.filter(isType('positions')).length;

    expect(count).toBeGreaterThanOrEqual(18);
    expect(count).toBeLessThanOrEqual(23);
  });

  it('usa um ciclo padrão que atende às frequências mínimas', async () => {
    await start(NEVER_TICKS_MS);
    expect(DEFAULT_TICK_INTERVAL_MS).toBeLessThanOrEqual(1_000);
  });

  it('compartilha a mesma conta entre clientes', async () => {
    await start(NEVER_TICKS_MS);
    const first = await connect();
    const second = await connect();

    first.send({ type: 'subscribe', channel: 'positions' });
    second.send({ type: 'subscribe', channel: 'positions' });
    const [a, b] = await Promise.all([first.waitForType('positions'), second.waitForType('positions')]);

    expect(a.data).toEqual(b.data);
    expect(a.data.positions.length).toBeGreaterThanOrEqual(3);
  });

  it('continua publicando depois que outro cliente desconecta', async () => {
    await start(FAST_TICK_MS);
    const leaving = await connect();
    const staying = await connect();
    await subscribe(leaving, 'quote', ['ALFA3']);
    await subscribe(staying, 'quote', ['ALFA3']);

    leaving.close();
    await leaving.closed;

    await staying.collect(10, isType('quote'));
  });

  it('isola as assinaturas por conexão', async () => {
    await start(FAST_TICK_MS);
    const first = await connect();
    const second = await connect();
    await subscribe(first, 'quote', ['ALFA3']);
    await subscribe(second, 'quote', ['BETA4']);

    const [a, b] = await Promise.all([
      first.collect(5, isType('quote')),
      second.collect(5, isType('quote')),
    ]);

    expect(a.every(({ data }) => data.symbol === 'ALFA3')).toBe(true);
    expect(b.every(({ data }) => data.symbol === 'BETA4')).toBe(true);
  });
});
