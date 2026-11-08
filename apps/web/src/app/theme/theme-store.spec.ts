import { TestBed } from '@angular/core/testing';

import { ThemeStore } from './theme-store';

describe('ThemeStore', () => {
  const root = document.documentElement;
  const KEY = 'open-windows-theme';

  afterEach(() => {
    TestBed.resetTestingModule();
    delete root.dataset['theme'];
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('acompanha o tema trocado em outro documento, sem gravar de novo', () => {
    const store = TestBed.inject(ThemeStore);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'dark' }));

    expect(store.theme()).toBe('dark');
    expect(root.dataset['theme']).toBe('dark');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('ignora outras chaves e valores inválidos', () => {
    const store = TestBed.inject(ThemeStore);

    window.dispatchEvent(new StorageEvent('storage', { key: 'outra', newValue: 'dark' }));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'azul' }));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: null }));

    expect(store.theme()).toBe('light');
    expect(root.dataset['theme']).toBeUndefined();
  });

  it('para de acompanhar quando é destruído', () => {
    const store = TestBed.inject(ThemeStore);

    TestBed.resetTestingModule();
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'dark' }));

    expect(store.theme()).toBe('light');
  });
});
