import { Component, inject } from '@angular/core';

import { ThemeStore } from './theme-store';

@Component({
  selector: 'app-theme-toggle',
  template: `
    <button
      type="button"
      class="flex size-10 cursor-pointer items-center justify-center rounded-full border border-line bg-card text-ink"
      [attr.aria-label]="store.theme() === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'"
      [attr.title]="store.theme() === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'"
      (click)="store.toggle()"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        class="size-5 fill-none stroke-current stroke-[1.8]"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        @if (store.theme() === 'dark') {
          <path
            d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          />
        } @else {
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        }
      </svg>
    </button>
  `,
})
export class ThemeToggle {
  protected readonly store = inject(ThemeStore);
}
