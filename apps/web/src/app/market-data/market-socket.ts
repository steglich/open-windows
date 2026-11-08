import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Subject } from 'rxjs';

import type { ClientMessage, ServerMessage } from './market-protocol';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export const MARKET_SOCKET_URL = new InjectionToken<string>('MARKET_SOCKET_URL', {
  providedIn: 'root',
  factory: () => 'ws://127.0.0.1:8090',
});

const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30_000;
const SILENCE_LIMIT_MS = 5000;
const SILENCE_CHECK_INTERVAL_MS = 1000;
const NORMAL_CLOSURE = 1000;

const SERVER_MESSAGE_TYPES: ReadonlySet<unknown> = new Set<ServerMessage['type']>([
  'welcome',
  'subscribed',
  'unsubscribed',
  'error',
  'quotes',
  'book',
  'positions',
  'account',
  'candles',
  'orders',
]);

function parseServerMessage(frame: unknown): ServerMessage | null {
  if (typeof frame !== 'string') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame);
  } catch {
    return null;
  }
  const isKnown =
    typeof parsed === 'object' &&
    parsed !== null &&
    SERVER_MESSAGE_TYPES.has((parsed as { type?: unknown }).type);
  return isKnown ? (parsed as ServerMessage) : null;
}

/** Dona do ciclo de vida da conexão: abertura, reconexão, silêncio e encerramento. */
@Injectable({ providedIn: 'root' })
export class MarketSocket {
  private readonly url = inject(MARKET_SOCKET_URL);
  private readonly statusState = signal<ConnectionStatus>('closed');
  private readonly messagesSubject = new Subject<ServerMessage>();

  readonly status = this.statusState.asReadonly();
  // Um signal guardaria só o último valor e perderia parte das rajadas de cada ciclo.
  readonly messages = this.messagesSubject.asObservable();

  private socket: WebSocket | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private silenceTimer: ReturnType<typeof setInterval> | undefined;
  private failedAttempts = 0;
  private lastMessageAt = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  connect(): void {
    if (this.socket !== undefined || this.retryTimer !== undefined) {
      return;
    }
    this.statusState.set('connecting');
    this.openSocket();
  }

  /** Mensagens enviadas sem conexão são descartadas: o próximo `welcome` refaz as assinaturas. */
  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.releaseSocket()?.close(NORMAL_CLOSURE);
    this.failedAttempts = 0;
    this.statusState.set('closed');
  }

  private openSocket(): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    socket.onmessage = (event) => this.handleFrame(event.data);
    // O evento `error` não é tratado porque é sempre seguido de `close`.
    socket.onclose = () => {
      this.releaseSocket();
      this.scheduleReconnect();
    };
    this.socket = socket;
  }

  private handleFrame(frame: unknown): void {
    this.lastMessageAt = Date.now();
    const message = parseServerMessage(frame);
    if (message === null) {
      console.warn('Frame inválido recebido do servidor.', frame);
      return;
    }
    if (message.type === 'welcome') {
      this.failedAttempts = 0;
      this.statusState.set('connected');
      this.startSilenceCheck();
    }
    this.messagesSubject.next(message);
  }

  private startSilenceCheck(): void {
    clearInterval(this.silenceTimer);
    this.silenceTimer = setInterval(() => {
      if (Date.now() - this.lastMessageAt >= SILENCE_LIMIT_MS) {
        this.releaseSocket()?.close(NORMAL_CLOSURE);
        this.scheduleReconnect();
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  }

  /** Desliga os handlers antes de soltar o socket para que um `close` atrasado seja ignorado. */
  private releaseSocket(): WebSocket | undefined {
    clearInterval(this.silenceTimer);
    this.silenceTimer = undefined;
    const socket = this.socket;
    if (socket !== undefined) {
      socket.onmessage = null;
      socket.onclose = null;
      this.socket = undefined;
    }
    return socket;
  }

  private scheduleReconnect(): void {
    this.statusState.set('reconnecting');
    const delay = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** this.failedAttempts, MAX_RETRY_DELAY_MS);
    this.failedAttempts++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.openSocket();
    }, delay);
  }
}
