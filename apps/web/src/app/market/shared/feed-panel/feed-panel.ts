import { Component, input } from '@angular/core';

/** Moldura comum dos painéis, com o título e os avisos de estado do feed. */
@Component({
  selector: 'app-feed-panel',
  templateUrl: './feed-panel.html',
})
export class FeedPanel {
  readonly title = input.required<string>();
  readonly hasData = input(false);
  readonly stale = input(false);
}
