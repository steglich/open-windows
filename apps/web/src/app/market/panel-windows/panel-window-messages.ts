import { panelById, type PanelId } from './panel-catalog';

/** Aviso de que a janela iniciou e já segura a sua trava. */
export interface PanelWindowMessage {
  readonly type: 'panel-window-ready';
  readonly panel: PanelId;
}

export function parsePanelWindowMessage(data: unknown): PanelWindowMessage | null {
  const { type, panel } = (data ?? {}) as Partial<Record<keyof PanelWindowMessage, unknown>>;
  if (type !== 'panel-window-ready') {
    return null;
  }
  const definition = typeof panel === 'string' ? panelById(panel) : undefined;
  return definition === undefined ? null : { type, panel: definition.id };
}
