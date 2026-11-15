import { describe, expect, test } from 'bun:test';

import {
  FOLDED_SECTIONS_STORAGE_KEY,
  isSectionFolded,
  readFoldedSections,
  toggledFold,
  writeFoldedSections,
} from './section-folds';

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

const memory = (initial: Record<string, string> = {}): Store & { readonly data: Record<string, string> } => {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
};

const refusing: Store = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('la mémoire par appareil des sections repliées', () => {
  test('relit les identifiants repliés écrits par l’appareil', () => {
    const store = memory({ [FOLDED_SECTIONS_STORAGE_KEY]: JSON.stringify(['lentille.older', 'pinned']) });
    expect([...readFoldedSections(store)].sort()).toEqual(['lentille.older', 'pinned']);
  });

  test('rien d’écrit ⇒ tout est déplié', () => {
    expect(readFoldedSections(memory()).size).toBe(0);
  });

  test('une valeur illisible est ignorée, jamais une exception', () => {
    expect(readFoldedSections(memory({ [FOLDED_SECTIONS_STORAGE_KEY]: '{pas du json' })).size).toBe(0);
    expect(readFoldedSections(memory({ [FOLDED_SECTIONS_STORAGE_KEY]: '{"a":1}' })).size).toBe(0);
    expect([...readFoldedSections(memory({ [FOLDED_SECTIONS_STORAGE_KEY]: '["pinned", 3, null, ""]' }))]).toEqual(['pinned']);
  });

  test('un stockage refusé (navigation privée, données bloquées) ne casse rien', () => {
    expect(readFoldedSections(refusing).size).toBe(0);
    expect(() => writeFoldedSections(new Set(['pinned']), refusing)).not.toThrow();
    expect(readFoldedSections(null).size).toBe(0);
  });

  test('écrit l’ensemble, et l’oublie quand plus rien n’est replié', () => {
    const store = memory();
    writeFoldedSections(new Set(['lentille.today']), store);
    expect(JSON.parse(store.data[FOLDED_SECTIONS_STORAGE_KEY] ?? '[]')).toEqual(['lentille.today']);
    writeFoldedSections(new Set(), store);
    expect(store.data[FOLDED_SECTIONS_STORAGE_KEY]).toBeUndefined();
  });

  test('une catégorie ne s’écrit pas sur l’appareil : sa préférence vit sur le serveur', () => {
    const store = memory();
    writeFoldedSections(new Set(['category:cat-1', 'lentille.older']), store);
    expect(JSON.parse(store.data[FOLDED_SECTIONS_STORAGE_KEY] ?? '[]')).toEqual(['lentille.older']);
  });
});

describe('toggledFold', () => {
  test('replie une section dépliée, déplie une section repliée, sans muter l’entrée', () => {
    const initial: ReadonlySet<string> = new Set(['pinned']);
    expect([...toggledFold(initial, 'lentille.today')].sort()).toEqual(['lentille.today', 'pinned']);
    expect([...toggledFold(initial, 'pinned')]).toEqual([]);
    expect([...initial]).toEqual(['pinned']);
  });
});

describe('isSectionFolded', () => {
  const folded: ReadonlySet<string> = new Set(['lentille.older']);

  test('une section virtuelle suit la mémoire de l’appareil', () => {
    expect(isSectionFolded({ section: { id: 'lentille.older' }, folded, searching: false })).toBe(true);
    expect(isSectionFolded({ section: { id: 'lentille.today' }, folded, searching: false })).toBe(false);
  });

  test('une catégorie suit la préférence SERVEUR `isExpanded`, jamais la mémoire locale', () => {
    const local: ReadonlySet<string> = new Set(['category:a']);
    expect(isSectionFolded({ section: { id: 'category:a', category: { isExpanded: true } }, folded: local, searching: false })).toBe(false);
    expect(isSectionFolded({ section: { id: 'category:b', category: { isExpanded: false } }, folded, searching: false })).toBe(true);
  });

  test('pendant une recherche, rien n’est replié : ce qu’on cherche ne se cache pas — et rien n’est oublié', () => {
    expect(isSectionFolded({ section: { id: 'lentille.older' }, folded, searching: true })).toBe(false);
    expect(isSectionFolded({ section: { id: 'category:b', category: { isExpanded: false } }, folded, searching: true })).toBe(false);
    expect(folded.has('lentille.older')).toBe(true);
  });
});
