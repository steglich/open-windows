import { TestBed } from '@angular/core/testing';

import { IN_PANEL_WINDOW, PanelWindowButton } from './panel-window-button';
import { PANEL_WINDOW_BRIDGE } from './panel-window-bridge';
import { PanelWindows } from './panel-windows';
import { FAKE_PANEL_WINDOW_PROVIDERS, FakePanelWindowBridge } from './testing/fake-panel-window';

describe('PanelWindowButton', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: FAKE_PANEL_WINDOW_PROVIDERS });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(PanelWindowButton);
    fixture.componentRef.setInput('panel', 'quotes');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('abre o painel ao ser acionado', async () => {
    const open = vi.spyOn(TestBed.inject(PanelWindows), 'open').mockImplementation(() => {});

    const button = (await render()).querySelector('button')!;
    button.click();

    expect(button.getAttribute('aria-label')).toBe('Abrir Cotações em janela');
    expect(open).toHaveBeenCalledWith('quotes');
  });

  it('não aparece dentro da janela do painel', async () => {
    TestBed.overrideProvider(IN_PANEL_WINDOW, { useValue: true });

    expect((await render()).querySelector('button')).toBeNull();
  });

  it('não aparece sem os recursos de janela', async () => {
    (TestBed.inject(PANEL_WINDOW_BRIDGE) as FakePanelWindowBridge).supported = false;

    expect((await render()).querySelector('button')).toBeNull();
  });
});
