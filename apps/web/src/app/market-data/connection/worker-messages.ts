import type { ClientMessage, ServerMessage } from '../market-protocol';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'unavailable';

export type TabToWorkerMessage =
  /** `lock` é uma trava que a aba segura enquanto existir. */
  | { type: 'attach'; url: string; lock?: string }
  | { type: 'send'; message: ClientMessage }
  | { type: 'detach' };

export type WorkerToTabMessage =
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'message'; message: ServerMessage }
  /** Texto original do servidor. Até o próximo quadro, um `frame` substitui o de mesma `key`; `null` nunca substitui. */
  | { type: 'frame'; frame: string; key: string | null };
