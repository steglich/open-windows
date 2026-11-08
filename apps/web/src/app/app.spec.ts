import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { App } from './app';
import { routes } from './app.routes';
import { FAKE_APEX_CHARTS_PROVIDERS } from './market-data/testing/fake-apex-charts';
import { FakeWebSocket } from './market-data/testing/fake-web-socket';
import { IN_PROCESS_MARKET_CONNECTION_PROVIDERS } from './market-data/testing/in-process-market-connection';

describe('App', () => {
  beforeEach(async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.instances = [];
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        ...FAKE_APEX_CHARTS_PROVIDERS,
        ...IN_PROCESS_MARKET_CONNECTION_PROVIDERS,
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create the app', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('exibe o dashboard na rota inicial', async () => {
    const fixture = TestBed.createComponent(App);

    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-dashboard h1')?.textContent).toContain(
      'Open Windows Homebroker',
    );
  });
});
