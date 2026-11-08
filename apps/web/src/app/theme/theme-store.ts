import { DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

/** Mesma chave do script de `index.html`, que escolhe o tema inicial antes do bundle carregar. */
const STORAGE_KEY = 'open-windows-theme';

@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly document = inject(DOCUMENT);
  private readonly root = this.document.documentElement;
  private readonly state = signal<Theme>(this.root.dataset['theme'] === 'dark' ? 'dark' : 'light');

  readonly theme = this.state.asReadonly();

  /** O evento só dispara nos outros documentos da origem, então não há eco ao gravar. */
  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
      this.apply(event.newValue);
    }
  };

  constructor() {
    const view = this.document.defaultView as Window;
    view.addEventListener('storage', this.onStorage);
    inject(DestroyRef).onDestroy(() => view.removeEventListener('storage', this.onStorage));
  }

  toggle(): void {
    const theme = this.state() === 'dark' ? 'light' : 'dark';
    this.apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Sem armazenamento, o tema vale só até recarregar a página.
    }
  }

  private apply(theme: Theme): void {
    this.root.dataset['theme'] = theme;
    this.state.set(theme);
  }
}
