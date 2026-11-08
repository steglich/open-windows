import type { ClientMessage, ServerMessage } from '../market-protocol';

/** Substituto do WebSocket do navegador. Os testes controlam cada evento da conexão. */
export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  static get last(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }

  readyState = FakeWebSocket.CONNECTING;
  sent: ClientMessage[] = [];
  closeCode: number | undefined;

  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(frame: string): void {
    this.sent.push(JSON.parse(frame) as ClientMessage);
  }

  close(code?: number): void {
    this.closeCode = code;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
  }

  receive(message: ServerMessage): void {
    this.receiveFrame(JSON.stringify(message));
  }

  receiveFrame(data: unknown): void {
    this.onmessage?.({ data });
  }

  /** Simula a queda da conexão ou a falha ao conectar. */
  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}
