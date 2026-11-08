import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FAKE_PANEL_WINDOW_PROVIDERS } from '../../panel-windows/testing/fake-panel-window';
import { FeedPanel } from './feed-panel';

describe('FeedPanel', () => {
  let fixture: ComponentFixture<FeedPanel>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: FAKE_PANEL_WINDOW_PROVIDERS });
    fixture = TestBed.createComponent(FeedPanel);
    fixture.componentRef.setInput('title', 'Cotações');
  });

  async function render(inputs: { hasData: boolean; stale: boolean }): Promise<string> {
    fixture.componentRef.setInput('hasData', inputs.hasData);
    fixture.componentRef.setInput('stale', inputs.stale);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('mostra o título', async () => {
    expect(await render({ hasData: true, stale: false })).toContain('Cotações');
  });

  it('avisa que está aguardando dados enquanto não há dados', async () => {
    expect(await render({ hasData: false, stale: false })).toContain('Aguardando dados');
  });

  it('avisa que os dados estão desatualizados', async () => {
    const text = await render({ hasData: true, stale: true });

    expect(text).toContain('Dados desatualizados');
    expect(text).not.toContain('Aguardando dados');
  });

  it('mostra o subtítulo quando informado', async () => {
    fixture.componentRef.setInput('subtitle', 'Candles de 1 minuto');

    expect(await render({ hasData: true, stale: false })).toContain('Candles de 1 minuto');
  });

  it('usa o fundo de card por padrão e dispensa o fundo na variante plain', async () => {
    await render({ hasData: true, stale: false });
    const section = (fixture.nativeElement as HTMLElement).querySelector('section')!;
    expect(section.classList).toContain('bg-card');

    fixture.componentRef.setInput('variant', 'plain');
    await fixture.whenStable();

    expect(section.classList).not.toContain('bg-card');
  });

  it('só oferece abrir em janela quando o painel é informado', async () => {
    await render({ hasData: true, stale: false });
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-panel-window-button')).toBeNull();

    fixture.componentRef.setInput('windowPanel', 'quotes');
    await fixture.whenStable();

    expect(element.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Abrir Cotações em janela',
    );
  });

  it('não mostra avisos com dados atualizados', async () => {
    const text = await render({ hasData: true, stale: false });

    expect(text).not.toContain('Dados desatualizados');
    expect(text).not.toContain('Aguardando dados');
  });
});
