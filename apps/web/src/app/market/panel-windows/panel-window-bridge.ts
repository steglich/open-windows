import { DOCUMENT, inject, InjectionToken } from '@angular/core';

import type { PanelId } from './panel-catalog';
import type { PanelWindowMessage } from './panel-window-messages';

export interface PanelWindowChannel {
  post(message: PanelWindowMessage): void;
  listen(handler: (data: unknown) => void): void;
  close(): void;
}

/** Recursos do navegador que ligam a página principal às janelas, em processos separados. */
export interface PanelWindowBridge {
  readonly supported: boolean;
  createId(): string;
  openChannel(pageId: string): PanelWindowChannel;
  /** Segura a trava até o documento acabar e avisa quando ela for obtida. */
  hold(lock: string, onHeld?: () => void): void;
  /** Avisa quando a trava for liberada. Só use com a trava já segura por outro documento. */
  whenReleased(lock: string, onReleased: () => void): () => void;
}

export function pageLockName(pageId: string): string {
  return `open-windows:page:${pageId}`;
}

export function panelLockName(pageId: string, panel: PanelId): string {
  return `open-windows:panel:${pageId}:${panel}`;
}

function createBrowserBridge(view: Window): PanelWindowBridge {
  // `navigator.locks` só existe em contexto seguro, embora a lib `dom` o declare sempre.
  const locks = view.navigator.locks as LockManager | undefined;
  const hasChannel = typeof BroadcastChannel === 'function';

  return {
    supported: locks !== undefined && hasChannel,
    createId: () => view.crypto.randomUUID(),
    openChannel(pageId) {
      const channel = new BroadcastChannel(`open-windows:panels:${pageId}`);
      return {
        post: (message) => channel.postMessage(message),
        listen: (handler) => (channel.onmessage = (event) => handler(event.data)),
        close: () => channel.close(),
      };
    },
    hold(lock, onHeld) {
      void locks?.request(lock, () => {
        onHeld?.();
        return new Promise<void>(() => {});
      });
    },
    whenReleased(lock, onReleased) {
      const controller = new AbortController();
      locks?.request(lock, { signal: controller.signal }, () => onReleased()).catch(() => {
        // O cancelamento rejeita o pedido, e nesse caso não há o que avisar.
      });
      return () => controller.abort();
    },
  };
}

/** Ponto único de acesso a Web Locks e `BroadcastChannel`, substituído nos specs. */
export const PANEL_WINDOW_BRIDGE = new InjectionToken<PanelWindowBridge>('PANEL_WINDOW_BRIDGE', {
  providedIn: 'root',
  factory: () => createBrowserBridge(inject(DOCUMENT).defaultView as Window),
});
