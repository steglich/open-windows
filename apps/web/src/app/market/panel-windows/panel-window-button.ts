import { Component, computed, inject, InjectionToken, input } from '@angular/core';

import { panelById, type PanelId } from './panel-catalog';
import { PanelWindows } from './panel-windows';

/** Verdadeiro para os painéis renderizados dentro de uma janela própria. */
export const IN_PANEL_WINDOW = new InjectionToken<boolean>('IN_PANEL_WINDOW', {
  providedIn: 'root',
  factory: () => false,
});

/** Controle que abre um painel em janela própria. Não aparece dentro da janela. */
@Component({
  selector: 'app-panel-window-button',
  template: `
    @if (windows?.supported) {
      <button
        type="button"
        class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink"
        [attr.aria-label]="label()"
        [attr.title]="label()"
        (click)="windows?.open(panel())"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          class="size-4 fill-none stroke-current stroke-[1.8]"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
        </svg>
      </button>
    }
  `,
})
export class PanelWindowButton {
  readonly panel = input.required<PanelId>();

  /** Dentro da janela o serviço não é criado, pois ele seguraria a trava de uma página. */
  protected readonly windows = inject(IN_PANEL_WINDOW) ? null : inject(PanelWindows);
  protected readonly label = computed(() => `Abrir ${panelById(this.panel())?.title} em janela`);
}
