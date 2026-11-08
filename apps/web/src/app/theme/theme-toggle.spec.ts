import { TestBed } from '@angular/core/testing';

import { ThemeStore } from './theme-store';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  const root = document.documentElement;

  afterEach(() => {
    TestBed.resetTestingModule();
    delete root.dataset['theme'];
    localStorage.clear();
  });

  async function render(): Promise<HTMLButtonElement> {
    const fixture = TestBed.createComponent(ThemeToggle);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('button')!;
  }

  it('parte do tema já definido no documento', () => {
    root.dataset['theme'] = 'dark';

    expect(TestBed.inject(ThemeStore).theme()).toBe('dark');
  });

  it('alterna o tema, aplica no documento e guarda a escolha', async () => {
    const button = await render();
    expect(button.getAttribute('aria-label')).toBe('Usar tema escuro');

    button.click();
    await TestBed.inject(ThemeStore);

    expect(TestBed.inject(ThemeStore).theme()).toBe('dark');
    expect(root.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('open-windows-theme')).toBe('dark');
  });

  it('volta ao tema claro e atualiza o rótulo do botão', async () => {
    root.dataset['theme'] = 'dark';
    const fixture = TestBed.createComponent(ThemeToggle);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Usar tema claro');

    button.click();
    await fixture.whenStable();

    expect(root.dataset['theme']).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Usar tema escuro');
  });

  it('continua funcionando sem armazenamento disponível', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const button = await render();

    button.click();

    expect(root.dataset['theme']).toBe('dark');
    vi.restoreAllMocks();
  });
});
