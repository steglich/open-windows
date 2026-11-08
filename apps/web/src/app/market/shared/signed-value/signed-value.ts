import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

/** Exibe uma variação ou resultado com o sinal e a cor de ganho, perda ou neutro. */
@Component({
  selector: 'app-signed-value',
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './signed-value.html',
})
export class SignedValue {
  readonly value = input.required<number>();
  readonly kind = input<'currency' | 'percent'>('currency');

  protected readonly plusSign = computed(() => (this.value() > 0 ? '+' : ''));
  protected readonly tone = computed(() => {
    const value = this.value();
    if (value > 0) {
      return 'text-gain';
    }
    return value < 0 ? 'text-loss' : 'text-ink-muted';
  });
}
