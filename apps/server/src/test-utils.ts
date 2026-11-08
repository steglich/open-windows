import { WebSocket } from 'ws';

import type { RandomSource } from './market/simulator.js';

export function seededRandom(seed: number): RandomSource {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

export type ReceivedMessage = Record<string, any>;
type Predicate = (message: ReceivedMessage) => boolean;

interface Waiter {
  predicate: Predicate;
  resolve: (message: ReceivedMessage) => void;
}

const WAIT_TIMEOUT_MS = 3_000;

/** Cliente WebSocket real que guarda as mensagens e permite aguardar as próximas, em ordem. */
export class TestClient {
  readonly messages: ReceivedMessage[] = [];
  readonly closed: Promise<number>;

  private cursor = 0;
  private waiter: Waiter | undefined;
  private readonly socket: WebSocket;

  private constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}`);
    this.socket.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()) as ReceivedMessage);
      this.flush();
    });
    this.closed = new Promise((resolve) => this.socket.once('close', resolve));
  }

  static async connect(port: number): Promise<TestClient> {
    const client = new TestClient(port);
    await new Promise<void>((resolve, reject) => {
      client.socket.once('open', resolve);
      client.socket.once('error', reject);
    });
    return client;
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(data: string | Buffer): void {
    this.socket.send(data);
  }

  waitFor(predicate: Predicate): Promise<ReceivedMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Tempo esgotado aguardando mensagem.')),
        WAIT_TIMEOUT_MS,
      );
      this.waiter = {
        predicate,
        resolve: (message) => {
          clearTimeout(timeout);
          resolve(message);
        },
      };
      this.flush();
    });
  }

  waitForType(type: string): Promise<ReceivedMessage> {
    return this.waitFor((message) => message.type === type);
  }

  /** Aguarda `count` mensagens que satisfaçam o predicado. */
  async collect(count: number, predicate: Predicate): Promise<ReceivedMessage[]> {
    const collected: ReceivedMessage[] = [];
    while (collected.length < count) {
      collected.push(await this.waitFor(predicate));
    }
    return collected;
  }

  close(): void {
    this.socket.terminate();
  }

  private flush(): void {
    if (!this.waiter) {
      return;
    }
    while (this.cursor < this.messages.length) {
      const message = this.messages[this.cursor++]!;
      if (this.waiter.predicate(message)) {
        const { resolve } = this.waiter;
        this.waiter = undefined;
        resolve(message);
        return;
      }
    }
  }
}
