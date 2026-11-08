import { TestBed } from '@angular/core/testing';

import { PT_BR_PROVIDERS, textOf } from '../../../market-data/testing/market-fixtures';
import { SignedValue } from './signed-value';

describe('SignedValue', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: PT_BR_PROVIDERS });
  });

  async function render(
    value: number,
    kind: 'currency' | 'percent',
  ): Promise<{ text: string; classes: string }> {
    const fixture = TestBed.createComponent(SignedValue);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('kind', kind);
    await fixture.whenStable();
    const span = (fixture.nativeElement as HTMLElement).querySelector('span')!;
    return { text: textOf(span).trim(), classes: span.className };
  }

  it('mostra valor positivo com + e na cor de ganho', async () => {
    expect(await render(12.5, 'currency')).toEqual({
      text: '+R$ 12,50',
      classes: 'text-emerald-700',
    });
  });

  it('mostra valor negativo com - e na cor de perda', async () => {
    expect(await render(-12.5, 'currency')).toEqual({
      text: '-R$ 12,50',
      classes: 'text-red-700',
    });
  });

  it('mostra zero sem sinal e na cor neutra', async () => {
    expect(await render(0, 'currency')).toEqual({ text: 'R$ 0,00', classes: 'text-slate-600' });
  });

  it('formata percentual sem multiplicar por 100', async () => {
    expect((await render(1.5, 'percent')).text).toBe('+1,50%');
    expect((await render(-4.25, 'percent')).text).toBe('-4,25%');
  });
});
