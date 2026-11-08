import { Routes } from '@angular/router';

import { Dashboard } from './market/dashboard/dashboard';
import { panelBySlug } from './market/panel-windows/panel-catalog';
import { PanelWindowPage } from './market/panel-windows/panel-window-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: Dashboard },
  {
    path: 'janela/:painel',
    component: PanelWindowPage,
    // Sem correspondência, um painel inexistente cai no redirecionamento abaixo.
    canMatch: [(_route, segments) => panelBySlug(segments[1].path) !== undefined],
  },
  { path: '**', redirectTo: '' },
];
