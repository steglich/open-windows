import { panelById, panelBySlug, PANELS } from './panel-catalog';

describe('catálogo de painéis', () => {
  it('tem seis painéis com ids e slugs únicos', () => {
    expect(PANELS).toHaveLength(6);
    expect(new Set(PANELS.map(({ id }) => id)).size).toBe(6);
    expect(new Set(PANELS.map(({ slug }) => slug)).size).toBe(6);
  });

  it('encontra um painel pelo id e pelo slug', () => {
    expect(panelById('quotes')?.slug).toBe('cotacoes');
    expect(panelBySlug('cotacoes')?.id).toBe('quotes');
  });

  it('não encontra painel inexistente', () => {
    expect(panelById('nada')).toBeUndefined();
    expect(panelBySlug('nada')).toBeUndefined();
  });
});
