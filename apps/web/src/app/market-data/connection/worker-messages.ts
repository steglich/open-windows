import type { ClientMessage, ServerMessage } from '../market-protocol';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'unavailable';

export type TabToWorkerMessage =
  | { type: 'attach'; url: string }
  | { type: 'send'; message: ClientMessage }
  | { type: 'detach' };

export type WorkerToTabMessage =
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'message'; message: ServerMessage };
