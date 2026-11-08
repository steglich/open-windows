import { TestBed } from '@angular/core/testing';

import { pageLockName, panelLockName, PANEL_WINDOW_BRIDGE } from './panel-window-bridge';
import { PANEL_OPEN_TIMEOUT_MS, PANEL_RETURN_DELAY_MS, PanelWindows } from './panel-windows';
import {
  FAKE_PAGE_ID,
  FAKE_PANEL_WINDOW_PROVIDERS,
  FakePanelWindowBridge,
} from './testing/fake-panel-window';

describe('PanelWindows', () => {
  let windows: PanelWindows;
  let bridge: FakePanelWindowBridge;
  let open: ReturnType<typeof vi.spyOn>;

  function setup(): void {
    windows = TestBed.inject(PanelWindows);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    open = vi.spyOn(window, 'open').mockReturnValue(null);
    TestBed.configureTestingModule({ providers: FAKE_PANEL_WINDOW_PROVIDERS });
    bridge = TestBed.inject(PANEL_WINDOW_BRIDGE) as FakePanelWindowBridge;
    setup();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function detachBook(): void {
    windows.open('book');
    bridge.ready('book');
  }

  it('segura a trava da página enquanto ela existir', () => {
    expect(bridge.held).toEqual([pageLockName(FAKE_PAGE_ID)]);
  });

  it('abre o painel em um processo próprio, identificando a página', () => {
    windows.open('book');

    expect(open).toHaveBeenCalledWith(
      `/janela/book?pagina=${FAKE_PAGE_ID}`,
      '_blank',
      'popup,noopener,width=900,height=640',
    );
  });

  it('só tira o painel da página quando a janela inicia', () => {
    windows.open('book');
    expect(windows.isDetached('book')).toBe(false);

    bridge.ready('book');

    expect(windows.isDetached('book')).toBe(true);
    expect(windows.isDetached('quotes')).toBe(false);
  });

  it('não abre outra janela enquanto aguarda a primeira iniciar', () => {
    windows.open('book');
    windows.open('book');

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('não abre outra janela para um painel já em janela', () => {
    detachBook();
    windows.open('book');

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('espera a trava da janela depois do ready', () => {
    detachBook();

    expect(bridge.isWatching(panelLockName(FAKE_PAGE_ID, 'book'))).toBe(true);
  });

  it('devolve o painel quando a trava é liberada e o prazo termina', () => {
    detachBook();

    bridge.releasePanel('book');
    vi.advanceTimersByTime(PANEL_RETURN_DELAY_MS - 1);
    expect(windows.isDetached('book')).toBe(true);

    vi.advanceTimersByTime(1);
    expect(windows.isDetached('book')).toBe(false);
  });

  it('permite abrir de novo depois do retorno', () => {
    detachBook();
    bridge.releasePanel('book');
    vi.advanceTimersByTime(PANEL_RETURN_DELAY_MS);

    windows.open('book');

    expect(open).toHaveBeenCalledTimes(2);
  });

  it('mantém o painel na janela quando ela recarrega dentro do prazo', () => {
    detachBook();

    bridge.releasePanel('book');
    vi.advanceTimersByTime(PANEL_RETURN_DELAY_MS - 1);
    bridge.ready('book');
    vi.advanceTimersByTime(PANEL_RETURN_DELAY_MS);

    expect(windows.isDetached('book')).toBe(true);
    expect(bridge.isWatching(panelLockName(FAKE_PAGE_ID, 'book'))).toBe(true);
  });

  it('volta a ocultar o painel quando a recarga passa do prazo', () => {
    detachBook();
    bridge.releasePanel('book');
    vi.advanceTimersByTime(PANEL_RETURN_DELAY_MS);
    expect(windows.isDetached('book')).toBe(false);

    bridge.ready('book');

    expect(windows.isDetached('book')).toBe(true);
  });

  it('ignora mensagens de outro tipo ou de painel inexistente', () => {
    bridge.deliver({ type: 'outro', panel: 'book' });
    bridge.deliver({ type: 'panel-window-ready', panel: 'nada' });
    bridge.deliver(null);

    expect(windows.detached().size).toBe(0);
  });

  it('mantém o painel e avisa quando a janela não inicia no prazo', () => {
    windows.open('book');

    vi.advanceTimersByTime(PANEL_OPEN_TIMEOUT_MS - 1);
    expect(windows.blocked()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(windows.blocked()).toBe(true);
    expect(windows.isDetached('book')).toBe(false);
  });

  it('não avisa quando a janela inicia dentro do prazo', () => {
    detachBook();

    vi.advanceTimersByTime(PANEL_OPEN_TIMEOUT_MS);

    expect(windows.blocked()).toBe(false);
  });

  it('permite tentar de novo depois de a janela não iniciar e limpa o aviso', () => {
    windows.open('book');
    vi.advanceTimersByTime(PANEL_OPEN_TIMEOUT_MS);

    windows.open('book');

    expect(open).toHaveBeenCalledTimes(2);
    expect(windows.blocked()).toBe(false);
  });

  it('limpa o aviso e oculta o painel quando a janela inicia depois do prazo', () => {
    windows.open('book');
    vi.advanceTimersByTime(PANEL_OPEN_TIMEOUT_MS);

    bridge.ready('book');

    expect(windows.blocked()).toBe(false);
    expect(windows.isDetached('book')).toBe(true);
  });

  it('não usa os recursos nem abre janelas quando eles não existem', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: FAKE_PANEL_WINDOW_PROVIDERS });
    bridge = TestBed.inject(PANEL_WINDOW_BRIDGE) as FakePanelWindowBridge;
    bridge.supported = false;
    setup();

    windows.open('book');

    expect(windows.supported).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(bridge.held).toEqual([]);
    expect(bridge.channelsOpened).toEqual([]);
  });
});
