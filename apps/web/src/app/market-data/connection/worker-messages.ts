import type { ClientMessage, ServerMessage } from '../market-protocol';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'unavailable';

export type TabToWorkerMessage =
  /** `lock` é uma trava que a aba segura enquanto existir. */
  | { type: 'attach'; url: string; lock?: string }
  | { type: 'send'; message: ClientMessage }
  | { type: 'detach' };

export type WorkerToTabMessage =
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'message'; message: ServerMessage };
