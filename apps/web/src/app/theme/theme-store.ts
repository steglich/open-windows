import { DOCUMENT, inject, Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

/** Mesma chave do script de `index.html`, que escolhe o tema inicial antes do bundle carregar. */
const STORAGE_KEY = 'open-windows-theme';

@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly state = signal<Theme>(this.root.dataset['theme'] === 'dark' ? 'dark' : 'light');

  readonly theme = this.state.asReadonly();

  toggle(): void {
    const theme = this.state() === 'dark' ? 'light' : 'dark';
    this.root.dataset['theme'] = theme;
    this.state.set(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Sem armazenamento, o tema vale só até recarregar a página.
    }
  }
}
