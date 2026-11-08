import { Component, input } from '@angular/core';

import type { PanelId } from '../../panel-windows/panel-catalog';
import { PanelWindowButton } from '../../panel-windows/panel-window-button';

/** Moldura comum dos painéis, com o título e os avisos de estado do feed. */
@Component({
  selector: 'app-feed-panel',
  imports: [PanelWindowButton],
  templateUrl: './feed-panel.html',
})
export class FeedPanel {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly hasData = input(false);
  readonly stale = input(false);
  /** `plain` dispensa o fundo do card, para painéis que já são compostos de cards. */
  readonly variant = input<'card' | 'plain'>('card');
  /** Painel a abrir em janela própria. Sem valor, o controle não é exibido. */
  readonly windowPanel = input<PanelId | null>(null);
}
