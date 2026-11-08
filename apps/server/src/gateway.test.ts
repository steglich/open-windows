import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_CHANNEL_RATES,
  DEFAULT_TICK_INTERVAL_MS,
  SIMULATED_START_TIME,
  startGateway,
  type ChannelRates,
  type Gateway,
  type GatewayOptions,
} from './gateway.js';
import { TestClient, type ReceivedMessage } from './test-utils.js';

const NEVER_TICKS_MS = 3_600_000;
const FAST_TICK_MS = 5;
/** Tempo suficiente para o envio contínuo alcançar todos os ativos em cada ciclo. */
const SEED_TICK_MS = 20;
const NO_RATES: ChannelRates = { quote: 0, book: 0, candle: 0 };
const FAST_RATES: ChannelRates = { quote: 1000, book: 1000, candle: 1000 };
const SEED_RATES: ChannelRates = { quote: 2000, book: 2000, candle: 2000 };
const VOLUME = { assets: 12, bookDepth: 5, orders: 400, positions: 5, sessions: 2 };
const SESSION_CANDLES = 390;
const CURRENT_CANDLES = 120;

let gateway: Gateway | undefined;
const gateways: Gateway[] = [];
const clients: TestClient[] = [];

async function launch(options: Partial<GatewayOptions>): Promise<Gateway> {
  const started = await startGateway({
    port: 0,
    host: '127.0.0.1',
    tickIntervalMs: NEVER_TICKS_MS,
    volume: VOLUME,
    rates: NO_RATES,
    ...options,
  });
  gateways.push(started);
  return started;
}

async function start(tickIntervalMs: number, rates: ChannelRates = NO_RATES): Promise<void> {
  gateway = await launch({ tickIntervalMs, seed: 11, rates });
}

/** Conecta um cliente e consome o `welcome`. */
async function connect(target: Gateway = gateway!): Promise<TestClient> {
  const client = await TestClient.connect(target.port);
  clients.push(client);
  await client.waitForType('welcome');
  return client;
}

async function subscribe(client: TestClient, channel: string, symbols?: string[]): Promise<void> {
  client.send({ type: 'subscribe', channel, symbols });
  await client.waitForType('subscribed');
}

const isType = (type: string) => (message: ReceivedMessage) => message.type === type;
const isResponse = (requestId: string) => (message: ReceivedMessage) =>
  message.requestId === requestId;
const cents = (value: number) => Math.round(value * 100);

function quoteOf(message: ReceivedMessage, symbol: string): ReceivedMessage | undefined {
  return message.data.find((quote: ReceivedMessage) => quote.symbol === symbol);
}

/** Percorre todas as páginas de ordens. */
async function fetchAllOrders(client: TestClient): Promise<ReceivedMessage[]> {
  const orders: ReceivedMessage[] = [];
  let total = Infinity;
  while (orders.length < total) {
    const requestId = `page-${orders.length}`;
    client.send({ type: 'getOrders', requestId, offset: orders.length, limit: 500 });
    const { data } = await client.waitFor(isResponse(requestId));
    orders.push(...data.items);
    total = data.total;
  }
  return orders;
}

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await Promise.all(gateways.splice(0).map((started) => started.close()));
  gateway = undefined;
});

describe('conexão e protocolo', () => {
  it('envia welcome como primeira mensagem', async () => {
    await start(NEVER_TICKS_MS);
    const client = await TestClient.connect(gateway!.port);
    clients.push(client);

    const welcome = await client.waitFor(() => true);

    expect(welcome.type).toBe('welcome');
    expect(welcome.channels).toEqual(['quote', 'book', 'candle', 'positions', 'account']);
    expect(welcome.symbols).toHaveLength(VOLUME.assets);
  });

  it('não envia dados sem assinatura', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();

    await delay(FAST_TICK_MS * 10);

    expect(client.messages.map(({ type }) => type)).toEqual(['welcome']);
  });

  it('confirma a assinatura e envia o estado atual em seguida', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.send({ type: 'subscribe', channel: 'quote', symbols: ['PETR4'] });

    expect(await client.waitFor(() => true)).toEqual({
      type: 'subscribed',
      channel: 'quote',
      symbols: ['PETR4'],
    });
    const quotes = await client.waitFor(() => true);
    expect(quotes.type).toBe('quotes');
    expect(quotes.data.map(({ symbol }: ReceivedMessage) => symbol)).toEqual(['PETR4']);
    expect(typeof quotes.timestamp).toBe('number');
  });

  it('assina todos os ativos quando symbols está ausente', async () => {
    await start(NEVER_TICKS_MS);
    const client = await TestClient.connect(gateway!.port);
    clients.push(client);
    const { symbols } = await client.waitForType('welcome');

    client.send({ type: 'subscribe', channel: 'book' });
    const books = await client.collect(symbols.length, isType('book'));

    expect(books.map(({ data }) => data.symbol).sort()).toEqual([...symbols].sort());
  });

  it('acumula assinaturas e publica apenas os ativos assinados', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();

    await subscribe(client, 'quote', ['PETR4']);
    await subscribe(client, 'quote', ['VALE3']);
    await client.collect(20, isType('quotes'));

    const recent = client.messages.filter(isType('quotes')).slice(-4);
    expect(recent.every(({ data }) => data.length === 1)).toBe(true);
    expect(new Set(recent.map(({ data }) => data[0].symbol))).toEqual(new Set(['PETR4', 'VALE3']));
  });

  it('cancela um ativo e mantém os demais', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'quote', ['PETR4', 'VALE3']);

    client.send({ type: 'unsubscribe', channel: 'quote', symbols: ['PETR4'] });
    await client.waitForType('unsubscribed');
    const batches = await client.collect(10, isType('quotes'));

    expect(batches.at(-1)!.data.map(({ symbol }: ReceivedMessage) => symbol)).toEqual(['VALE3']);
  });

  it('cancela o canal inteiro', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
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
      '{"type":"subscribe","channel":"quote","symbols":["PETR4","XPTO9"]}',
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
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();

    client.send({ type: 'subscribe', channel: 'quote', symbols: ['PETR4', 'XPTO9'] });
    await client.waitForType('error');
    await delay(FAST_TICK_MS * 10);

    expect(client.messages.some(isType('quotes'))).toBe(false);
  });

  it('mantém as assinaturas existentes após um erro', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'quote', ['PETR4']);

    client.sendRaw('{oops');
    await client.waitForType('error');

    await client.collect(3, isType('quotes'));
  });

  it('fecha apenas a conexão que excede o limite de tamanho', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const offender = await connect();
    const other = await connect();
    await subscribe(other, 'quote', ['PETR4']);

    offender.sendRaw('x'.repeat(16 * 1024 + 1));

    expect(await offender.closed).toBe(1009);
    await other.collect(3, isType('quotes'));
  });
});

describe('publicação', () => {
  it('mantém as melhores ofertas iguais em cotação e book do mesmo ciclo', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'quote', ['PETR4']);
    await subscribe(client, 'book', ['PETR4']);

    await client.collect(50, isType('book'));

    const quotesByCycle = new Map(
      client.messages
        .filter(isType('quotes'))
        .map((message) => [message.timestamp, quoteOf(message, 'PETR4')!]),
    );
    let compared = 0;
    for (const message of client.messages.filter(isType('book'))) {
      const quote = quotesByCycle.get(message.timestamp);
      if (quote) {
        expect(message.data.bids[0].price).toBe(quote.bid);
        expect(message.data.asks[0].price).toBe(quote.ask);
        expect(message.data.spread).toBeCloseTo(quote.ask - quote.bid, 2);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('envia uma cotação por mensagem, em rodízio entre os ativos', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'quote');
    await client.waitForType('quotes');

    const messages = await client.collect(VOLUME.assets * 2, isType('quotes'));

    expect(messages.every(({ data }) => data.length === 1)).toBe(true);
    expect(new Set(messages.map(({ data }) => data[0].symbol)).size).toBe(VOLUME.assets);
  });

  it('usa o instante do ciclo como timestamp das mensagens contínuas', async () => {
    gateway = await launch({ tickIntervalMs: FAST_TICK_MS, rates: FAST_RATES });
    const client = await connect();
    await subscribe(client, 'quote', ['PETR4']);
    await client.waitForType('quotes');

    const messages = await client.collect(20, isType('quotes'));

    for (const { timestamp, data } of messages) {
      expect(data[0].updatedAt).toBe(timestamp);
    }
  });

  it('usa por padrão as taxas definidas para cada canal', () => {
    expect(DEFAULT_CHANNEL_RATES).toEqual({ book: 1000, quote: 500, candle: 350 });
  });

  it('mantém a taxa configurada de cada canal', { timeout: 10_000 }, async () => {
    const windowMs = 2_000;
    gateway = await launch({ seed: 11, tickIntervalMs: 500, rates: DEFAULT_CHANNEL_RATES });
    const client = await connect();
    await subscribe(client, 'quote', ['PETR4']);
    await subscribe(client, 'book', ['PETR4']);
    await subscribe(client, 'candle', ['PETR4']);
    const start = client.messages.length;

    await delay(windowMs);

    const received = client.messages.slice(start);
    for (const [type, rate] of [
      ['quotes', DEFAULT_CHANNEL_RATES.quote],
      ['book', DEFAULT_CHANNEL_RATES.book],
      ['candle', DEFAULT_CHANNEL_RATES.candle],
    ] as const) {
      const expected = (rate * windowMs) / 1000;
      const count = received.filter(isType(type)).length;
      expect(count).toBeGreaterThanOrEqual(expected * 0.9);
      expect(count).toBeLessThanOrEqual(expected * 1.1);
    }
  });

  it('mantém updatedAt até o timestamp da mensagem', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'quote');

    const batches = await client.collect(5, isType('quotes'));

    for (const { timestamp, data } of batches) {
      for (const { updatedAt } of data) {
        expect(updatedAt).toBeLessThanOrEqual(timestamp);
      }
    }
  });

  it('avalia as posições pelo último preço publicado', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'quote');
    await subscribe(client, 'positions');

    await client.collect(30, isType('positions'));

    const lastByCycle = new Map<string, number>();
    for (const { timestamp, data } of client.messages.filter(isType('quotes'))) {
      for (const { symbol, last } of data) {
        lastByCycle.set(`${timestamp}:${symbol}`, last);
      }
    }
    let compared = 0;
    for (const { timestamp, data } of client.messages.filter(isType('positions'))) {
      for (const { symbol, lastPrice } of data.positions) {
        const last = lastByCycle.get(`${timestamp}:${symbol}`);
        if (last !== undefined) {
          expect(lastPrice).toBe(last);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('publica o saldo depois das posições, com o patrimônio do mesmo ciclo', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'positions');
    await subscribe(client, 'account');

    await client.collect(10, isType('account'));

    let portfolio: ReceivedMessage | undefined;
    let compared = 0;
    for (const message of client.messages) {
      if (message.type === 'positions') {
        portfolio = message;
      } else if (message.type === 'account' && portfolio) {
        const { availableBalance, blockedBalance, totalEquity, accountId } = message.data;
        expect(accountId).toBe(portfolio.data.accountId);
        expect(message.timestamp).toBe(portfolio.timestamp);
        expect(cents(totalEquity)).toBe(
          cents(availableBalance) + cents(blockedBalance) + cents(portfolio.data.totalMarketValue),
        );
        compared++;
      }
    }
    expect(compared).toBeGreaterThanOrEqual(10);
  });

  it('envia o saldo imediatamente na assinatura e cancela o canal', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'account');
    await client.waitForType('account');

    client.send({ type: 'unsubscribe', channel: 'account' });
    await client.waitForType('unsubscribed');
    const received = client.messages.length;
    await delay(FAST_TICK_MS * 10);

    expect(client.messages.length).toBe(received);
  });

  it('publica posições a cada dois ciclos', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'positions');
    await client.waitForType('positions');

    const messages = await client.collect(10, isType('positions'));

    const gaps = messages.slice(1).map(({ timestamp }, index) => timestamp - messages[index]!.timestamp);
    expect(new Set(gaps)).toEqual(new Set([2 * FAST_TICK_MS]));
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
    expect(a.data.positions).toHaveLength(VOLUME.positions);
  });

  it('continua publicando depois que outro cliente desconecta', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const leaving = await connect();
    const staying = await connect();
    await subscribe(leaving, 'quote', ['PETR4']);
    await subscribe(staying, 'quote', ['PETR4']);

    leaving.close();
    await leaving.closed;

    await staying.collect(10, isType('quotes'));
  });

  it('isola as assinaturas por conexão', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const first = await connect();
    const second = await connect();
    await subscribe(first, 'quote', ['PETR4']);
    await subscribe(second, 'quote', ['VALE3']);

    const [a, b] = await Promise.all([
      first.collect(5, isType('quotes')),
      second.collect(5, isType('quotes')),
    ]);

    expect(a.every(({ data }) => data.length === 1 && data[0].symbol === 'PETR4')).toBe(true);
    expect(b.every(({ data }) => data.length === 1 && data[0].symbol === 'VALE3')).toBe(true);
  });
});

describe('canal candle', () => {
  it('confirma a assinatura e envia o candle em andamento em seguida', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.send({ type: 'subscribe', channel: 'candle', symbols: ['PETR4'] });

    expect(await client.waitFor(() => true)).toEqual({
      type: 'subscribed',
      channel: 'candle',
      symbols: ['PETR4'],
    });
    const message = await client.waitFor(() => true);
    expect(message.type).toBe('candle');
    expect(message.data.symbol).toBe('PETR4');
    expect(message.data.interval).toBe('1m');

    client.send({ type: 'getCandles', requestId: 'last', symbol: 'PETR4', limit: 1 });
    const { data } = await client.waitFor(isResponse('last'));
    expect(message.data.candle).toEqual(data.candles[0]);
  });

  it('envia um candle por ativo ao assinar todos', async () => {
    await start(NEVER_TICKS_MS);
    const client = await TestClient.connect(gateway!.port);
    clients.push(client);
    const { symbols } = await client.waitForType('welcome');

    client.send({ type: 'subscribe', channel: 'candle' });
    const messages = await client.collect(symbols.length, isType('candle'));

    expect(messages.map(({ data }) => data.symbol).sort()).toEqual([...symbols].sort());
  });

  it('publica somente os ativos assinados', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'candle', ['VALE3']);

    const messages = await client.collect(20, isType('candle'));

    expect(messages.every(({ data }) => data.symbol === 'VALE3')).toBe(true);
  });

  it('para de publicar ao cancelar a assinatura', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'candle', ['VALE3']);
    await client.collect(5, isType('candle'));

    client.send({ type: 'unsubscribe', channel: 'candle' });
    await client.waitForType('unsubscribed');
    const received = client.messages.length;
    await delay(FAST_TICK_MS * 10);

    expect(client.messages.length).toBe(received);
  });

  it('mantém o fechamento igual ao último preço da cotação do mesmo ciclo', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'quote', ['PETR4']);
    await subscribe(client, 'candle', ['PETR4']);

    await client.collect(50, isType('candle'));

    const quotesByCycle = new Map(
      client.messages
        .filter(isType('quotes'))
        .map((message) => [message.timestamp, quoteOf(message, 'PETR4')!]),
    );
    let compared = 0;
    for (const { timestamp, data } of client.messages.filter(isType('candle'))) {
      const quote = quotesByCycle.get(timestamp);
      if (quote) {
        expect(data.candle.close).toBe(quote.last);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });
});

describe('consultas', () => {
  it('correlaciona a resposta de candles pelo requestId', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.send({ type: 'getCandles', requestId: 'abc', symbol: 'PETR4', limit: 3 });
    const response = await client.waitForType('candles');

    expect(response.requestId).toBe('abc');
    expect(response.data.symbol).toBe('PETR4');
    expect(response.data.interval).toBe('1m');
    expect(response.data.candles).toHaveLength(3);
    expect(Object.keys(response.data.candles[0]).sort()).toEqual(
      ['close', 'financialVolume', 'high', 'low', 'open', 'time', 'volume'].sort(),
    );
  });

  it('usa 390 candles como padrão e pagina para trás', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.send({ type: 'getCandles', requestId: 'first', symbol: 'PETR4' });
    const first = await client.waitFor(isResponse('first'));
    expect(first.data.candles).toHaveLength(SESSION_CANDLES);

    const before = first.data.candles[0].time;
    client.send({ type: 'getCandles', requestId: 'second', symbol: 'PETR4', before, limit: 10 });
    const second = await client.waitFor(isResponse('second'));

    expect(second.data.candles).toHaveLength(10);
    expect(second.data.candles.every(({ time }: ReceivedMessage) => time < before)).toBe(true);
  });

  it('coincide a cotação com os candles do pregão corrente', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();
    await subscribe(client, 'quote', ['PETR4']);
    const { data } = await client.waitForType('quotes');
    const quote = data[0];

    client.send({ type: 'getCandles', requestId: 'all', symbol: 'PETR4', limit: 3000 });
    const { data: history } = await client.waitFor(isResponse('all'));
    const today: ReceivedMessage[] = history.candles.slice(-CURRENT_CANDLES);
    const previous = history.candles.at(-CURRENT_CANDLES - 1);

    expect(history.candles).toHaveLength(VOLUME.sessions * SESSION_CANDLES + CURRENT_CANDLES);
    expect(quote.open).toBe(today[0]!.open);
    expect(quote.high).toBe(Math.max(...today.map(({ high }) => high)));
    expect(quote.low).toBe(Math.min(...today.map(({ low }) => low)));
    expect(quote.last).toBe(today.at(-1)!.close);
    expect(quote.previousClose).toBe(previous.close);
    expect(quote.volume).toBe(today.reduce((sum, { volume }) => sum + volume, 0));
    expect(cents(quote.financialVolume)).toBe(
      today.reduce((sum, { financialVolume }) => sum + cents(financialVolume), 0),
    );
  });

  it('atualiza o candle em andamento com os ciclos', async () => {
    await start(FAST_TICK_MS);
    const client = await connect();
    client.send({ type: 'getCandles', requestId: 'first', symbol: 'PETR4', limit: 1 });
    const first = await client.waitFor(isResponse('first'));
    await delay(FAST_TICK_MS * 20);

    client.send({ type: 'getCandles', requestId: 'later', symbol: 'PETR4', limit: 1 });
    const later = await client.waitFor(isResponse('later'));

    expect(later.timestamp).toBeGreaterThan(first.timestamp);
    expect(later.data.candles[0].volume).toBeGreaterThan(first.data.candles[0].volume);
  });

  it('responde ordens com paginação, filtros e total', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.send({
      type: 'getOrders',
      requestId: 'partial',
      status: 'PARTIALLY_FILLED',
      limit: 3,
    });
    const response = await client.waitFor(isResponse('partial'));

    expect(response.type).toBe('orders');
    expect(response.data.items).toHaveLength(3);
    expect(response.data.total).toBe(20);
    expect(response.data.offset).toBe(0);
    expect(response.data.limit).toBe(3);
    expect(
      response.data.items.every(({ status }: ReceivedMessage) => status === 'PARTIALLY_FILLED'),
    ).toBe(true);
  });

  it('mantém as ordens iguais depois de vários ciclos', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();

    client.send({ type: 'getOrders', requestId: 'before', limit: 50 });
    const first = await client.waitFor(isResponse('before'));
    await delay(FAST_TICK_MS * 20);
    client.send({ type: 'getOrders', requestId: 'after', limit: 50 });
    const second = await client.waitFor(isResponse('after'));

    expect(second.data).toEqual(first.data);
  });

  it('mantém updatedAt até o timestamp da resposta', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.send({ type: 'getOrders', requestId: 'dates', limit: 500 });
    const { timestamp, data } = await client.waitFor(isResponse('dates'));

    for (const { createdAt, updatedAt } of data.items) {
      expect(createdAt).toBeLessThanOrEqual(updatedAt);
      expect(updatedAt).toBeLessThanOrEqual(timestamp);
    }
  });

  it('devolve o requestId nos erros e mantém a conexão', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();

    client.send({ type: 'getCandles', requestId: 'bad', symbol: 'XXXX9' });
    expect(await client.waitFor(isResponse('bad'))).toMatchObject({
      type: 'error',
      code: 'UNKNOWN_SYMBOL',
    });

    client.send({ type: 'getOrders', requestId: 'worse', status: 'PENDING' });
    expect(await client.waitFor(isResponse('worse'))).toMatchObject({
      type: 'error',
      code: 'INVALID_MESSAGE',
    });

    await subscribe(client, 'positions');
  });

  it('rejeita o envio de ordem sem alterar a conta', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();
    await subscribe(client, 'account');
    const before = await client.waitForType('account');

    client.send({ type: 'placeOrder', symbol: 'PETR4', quantity: 100, side: 'BUY' });
    expect(await client.waitForType('error')).toMatchObject({ code: 'INVALID_MESSAGE' });

    client.send({ type: 'unsubscribe', channel: 'account' });
    await client.waitForType('unsubscribed');
    await subscribe(client, 'account');
    expect((await client.waitForType('account')).data).toEqual(before.data);
  });
});

describe('coerência entre seções', () => {
  it('deriva saldo bloqueado e custódia das ordens', async () => {
    await start(NEVER_TICKS_MS);
    const client = await connect();
    await subscribe(client, 'positions');
    const { data: portfolio } = await client.waitForType('positions');
    await subscribe(client, 'account');
    const { data: balance } = await client.waitForType('account');
    const orders = await fetchAllOrders(client);

    expect(orders).toHaveLength(VOLUME.orders);

    const active = orders.filter(
      ({ status }) => status === 'OPEN' || status === 'PARTIALLY_FILLED',
    );
    const blocked = active
      .filter(({ side }) => side === 'BUY')
      .reduce(
        (sum, order) => sum + cents(order.price) * (order.requestedQuantity - order.filledQuantity),
        0,
      );
    expect(cents(balance.blockedBalance)).toBe(blocked);
    expect(balance.availableBalance).toBeGreaterThan(0);

    const held = new Set(portfolio.positions.map(({ symbol }: ReceivedMessage) => symbol));
    for (const position of portfolio.positions) {
      const own = orders.filter(({ symbol }) => symbol === position.symbol);
      const net = own.reduce(
        (sum, { side, filledQuantity }) =>
          sum + (side === 'BUY' ? filledQuantity : -filledQuantity),
        0,
      );
      expect(position.quantity).toBe(net);

      const reserved = active
        .filter(({ symbol, side }) => symbol === position.symbol && side === 'SELL')
        .reduce((sum, order) => sum + order.requestedQuantity - order.filledQuantity, 0);
      expect(position.blockedQuantity).toBe(reserved);
      expect(position.blockedQuantity).toBeLessThanOrEqual(position.quantity);
    }

    for (const { symbol, filledQuantity } of orders) {
      if (!held.has(symbol)) {
        expect(filledQuantity).toBe(0);
      }
    }
  });

  it('mantém o saldo disponível e o bloqueado constantes', async () => {
    await start(FAST_TICK_MS, FAST_RATES);
    const client = await connect();
    await subscribe(client, 'account');

    const messages = await client.collect(6, isType('account'));

    expect(new Set(messages.map(({ data }) => data.availableBalance)).size).toBe(1);
    expect(new Set(messages.map(({ data }) => data.blockedBalance)).size).toBe(1);
  });
});

describe('seed', () => {
  /** Dados de cada ativo em cada ciclo, indexados pelo timestamp do relógio simulado. */
  function byCycle(client: TestClient, type: string): Map<string, ReceivedMessage> {
    const items = new Map<string, ReceivedMessage>();
    for (const message of client.messages.filter(isType(type))) {
      if (type === 'quotes') {
        for (const quote of message.data) {
          items.set(`${message.timestamp}:${quote.symbol}`, quote);
        }
      } else {
        items.set(`${message.timestamp}:${message.data.symbol ?? ''}`, message);
      }
    }
    return items;
  }

  function expectSameCycles(a: TestClient, b: TestClient, type: string): void {
    const first = byCycle(a, type);
    const second = byCycle(b, type);
    let compared = 0;
    for (const [key, item] of first) {
      const other = second.get(key);
      if (other) {
        expect(other).toEqual(item);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(0);
  }

  it('reproduz os dados de cada ativo e ciclo com a mesma seed', async () => {
    const first = await launch({ seed: 42, tickIntervalMs: SEED_TICK_MS, rates: SEED_RATES });
    const second = await launch({ seed: 42, tickIntervalMs: SEED_TICK_MS, rates: SEED_RATES });
    const a = await connect(first);
    const b = await connect(second);

    for (const client of [a, b]) {
      await subscribe(client, 'quote');
      await subscribe(client, 'book', ['PETR4']);
      await subscribe(client, 'candle', ['PETR4']);
      await subscribe(client, 'positions');
      await subscribe(client, 'account');
    }
    await Promise.all([a, b].map((client) => client.collect(10, isType('account'))));

    for (const type of ['quotes', 'book', 'candle', 'positions', 'account']) {
      expectSameCycles(a, b, type);
    }
  });

  it('não muda as cotações conforme as assinaturas do cliente', async () => {
    const first = await launch({ seed: 42, tickIntervalMs: SEED_TICK_MS, rates: SEED_RATES });
    const second = await launch({ seed: 42, tickIntervalMs: SEED_TICK_MS, rates: SEED_RATES });
    const withBooks = await connect(first);
    const withoutBooks = await connect(second);

    await subscribe(withBooks, 'book');
    await subscribe(withBooks, 'quote');
    await subscribe(withoutBooks, 'quote');
    await Promise.all(
      [withBooks, withoutBooks].map((client) => client.collect(400, isType('quotes'))),
    );

    expectSameCycles(withBooks, withoutBooks, 'quotes');
  });

  it('reproduz as respostas de consultas com a mesma seed', async () => {
    const first = await connect(await launch({ seed: 7 }));
    const second = await connect(await launch({ seed: 7 }));

    for (const client of [first, second]) {
      client.send({ type: 'getOrders', requestId: 'o', limit: 500 });
      client.send({ type: 'getCandles', requestId: 'c', symbol: 'VALE3', limit: 500 });
    }

    expect(await second.waitFor(isResponse('o'))).toEqual(await first.waitFor(isResponse('o')));
    expect(await second.waitFor(isResponse('c'))).toEqual(await first.waitFor(isResponse('c')));
  });

  it('usa o relógio simulado com seed', async () => {
    gateway = await launch({ seed: 5 });
    const client = await connect();
    await subscribe(client, 'quote', ['PETR4']);
    const { timestamp, data } = await client.waitForType('quotes');

    expect(timestamp).toBe(SIMULATED_START_TIME);
    expect(data[0].updatedAt).toBe(SIMULATED_START_TIME);
  });

  it('usa o relógio real e dados diferentes sem seed', async () => {
    const before = Date.now();
    const first = await launch({});
    const second = await launch({});
    const a = await connect(first);
    const b = await connect(second);

    await subscribe(a, 'quote', ['PETR4']);
    await subscribe(b, 'quote', ['PETR4']);
    const [x, y] = await Promise.all([a.waitForType('quotes'), b.waitForType('quotes')]);

    expect(first.seed).not.toBe(second.seed);
    expect(x.timestamp).toBeGreaterThanOrEqual(before);
    expect(x.data[0].last).not.toBe(y.data[0].last);
  });

  it('informa a seed usada', async () => {
    expect((await launch({ seed: 123 })).seed).toBe(123);
  });
});

describe('volume padrão', () => {
  it('parte em até 5 s com todos os dados prontos', { timeout: 30_000 }, async () => {
    const startedAt = performance.now();
    const target = await startGateway({
      port: 0,
      host: '127.0.0.1',
      tickIntervalMs: NEVER_TICKS_MS,
      seed: 1,
      rates: NO_RATES,
    });
    gateways.push(target);
    const startupMs = performance.now() - startedAt;

    const client = await TestClient.connect(target.port);
    clients.push(client);
    const welcome = await client.waitForType('welcome');
    await subscribe(client, 'book', ['PETR4']);
    const book = await client.waitForType('book');
    await subscribe(client, 'positions');
    const positions = await client.waitForType('positions');
    client.send({ type: 'getOrders', requestId: 'total', limit: 1 });
    const orders = await client.waitFor(isResponse('total'));
    client.send({ type: 'getCandles', requestId: 'history', symbol: 'VALE3', limit: 3000 });
    const candles = await client.waitFor(isResponse('history'));

    expect(startupMs).toBeLessThanOrEqual(5_000);
    expect(welcome.symbols).toHaveLength(500);
    expect(book.data.bids).toHaveLength(50);
    expect(book.data.asks).toHaveLength(50);
    expect(positions.data.positions).toHaveLength(300);
    expect(orders.data.total).toBe(10_000);
    expect(candles.data.candles).toHaveLength(5 * SESSION_CANDLES + CURRENT_CANDLES);

    for (const status of ['OPEN', 'FILLED', 'CANCELLED', 'PARTIALLY_FILLED']) {
      client.send({ type: 'getOrders', requestId: status, status, limit: 1 });
      const { data } = await client.waitFor(isResponse(status));
      expect(data.total).toBeGreaterThanOrEqual(100);
    }
  });
});
