import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { FAKE_APEX_CHARTS_PROVIDERS, FakeApexCharts } from './market-data/testing/fake-apex-charts';
import { FakeWebSocket } from './market-data/testing/fake-web-socket';

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    FakeApexCharts.instances = [];
    await TestBed.configureTestingModule({
      imports: [App],
      providers: FAKE_APEX_CHARTS_PROVIDERS,
    })
      .compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Open Windows Homebroker');
  });

  it('cada item da barra lateral leva a uma seção existente', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const links = Array.from(compiled.querySelectorAll('nav a'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(compiled.querySelector(link.getAttribute('href') as string)).not.toBeNull();
    }
  });

  it('exibe os seis painéis sem abrir conexão nem criar gráficos', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    for (const panel of [
      'app-connection-status-panel',
      'app-quotes-panel',
      'app-order-book-panel',
      'app-portfolio-panel',
      'app-account-panel',
      'app-price-chart-panel',
    ]) {
      expect(compiled.querySelector(panel)).not.toBeNull();
    }
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(FakeApexCharts.instances).toHaveLength(0);
  });
});
