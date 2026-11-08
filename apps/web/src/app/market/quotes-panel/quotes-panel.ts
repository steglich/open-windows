import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { MarketStore } from '../../market-data/market-store';
import { FeedPanel } from '../shared/feed-panel/feed-panel';
import { SignedValue } from '../shared/signed-value/signed-value';

@Component({
  selector: 'app-quotes-panel',
  imports: [CurrencyPipe, DecimalPipe, FeedPanel, SignedValue],
  templateUrl: './quotes-panel.html',
})
export class QuotesPanel {
  protected readonly store = inject(MarketStore);
}
