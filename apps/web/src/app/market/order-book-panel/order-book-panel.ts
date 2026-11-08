import { CurrencyPipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';

import { MarketStore } from '../../market-data/market-store';
import { FeedPanel } from '../shared/feed-panel/feed-panel';

@Component({
  selector: 'app-order-book-panel',
  imports: [CurrencyPipe, DecimalPipe, FeedPanel, NgTemplateOutlet],
  templateUrl: './order-book-panel.html',
})
export class OrderBookPanel {
  protected readonly store = inject(MarketStore);
}
