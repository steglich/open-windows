import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';

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

  protected readonly summary = computed(() => {
    const rows = this.store.quoteRows();
    const rising = rows.filter(({ change }) => change > 0).length;
    const falling = rows.filter(({ change }) => change < 0).length;
    return [
      { label: 'Ativos', count: rows.length, tone: 'bg-blue text-cream' },
      { label: 'Em alta', count: rising, tone: 'bg-teal text-navy' },
      { label: 'Em baixa', count: falling, tone: 'bg-rust text-cream' },
      { label: 'Estáveis', count: rows.length - rising - falling, tone: 'bg-amber text-navy' },
    ];
  });
}
