import { Component, input } from '@angular/core';

/** Moldura comum dos painéis, com o título e os avisos de estado do feed. */
@Component({
  selector: 'app-feed-panel',
  templateUrl: './feed-panel.html',
})
export class FeedPanel {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly hasData = input(false);
  readonly stale = input(false);
  /** `plain` dispensa o fundo do card, para painéis que já são compostos de cards. */
  readonly variant = input<'card' | 'plain'>('card');
}
