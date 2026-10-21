import { describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';

import { rowMenuItems, rowReadingModeMenu, rowSubmenuItems } from './row-actions';

/**
 * LE MENU D'UNE LIGNE PORTE « RECHERCHER » ET « MODE DE LECTURE › » (#11226) —
 * les deux portes du menu contextuel d'iOS (`ConversationListView+Overlays.swift`) :
 * « Rechercher » ouvre la conversation sur sa recherche, « Mode de lecture »
 * choisit comment elle s'ouvrira (Automatique, puis les cinq modes du fil).
 */
const flags = { isPinned: false, isMuted: false, isArchived: false };
const doors = { search: true, readingMode: true } as const;

describe('rowMenuItems — Rechercher et Mode de lecture, à la place d’iOS', () => {
  test('« Rechercher » suit « Sourdine », « Mode de lecture › » suit « Lu »', () => {
    const items = rowMenuItems({ flags, unread: false, language: 'fr', canCall: true, canDelete: true, doors });
    expect(items.map((i) => i.id)).toEqual(['callAudio', 'callVideo', 'pin', 'mute', 'search', 'read', 'readingMode', 'archive', 'delete']);
    expect(items.find((i) => i.id === 'search')).toMatchObject({ label: 'Rechercher', glyph: 'magnifyingGlass' });
    expect(items.find((i) => i.id === 'readingMode')).toMatchObject({ label: 'Mode de lecture', glyph: 'eye', submenu: 'readingMode' });
  });

  test('sans portes (le balayage), le menu reste celui d’avant', () => {
    const items = rowMenuItems({ flags, unread: false, language: 'fr' });
    expect(items.map((i) => i.id)).toEqual(['pin', 'mute', 'read', 'archive']);
  });

  test('les modes de lecture coupés au déploiement : pas de sous-menu, la recherche reste', () => {
    const items = rowMenuItems({ flags, unread: false, language: 'fr', doors: { search: true, readingMode: false } });
    expect(items.map((i) => i.id)).toEqual(['pin', 'mute', 'search', 'read', 'archive']);
  });

  test('en anglais, les mots d’iOS', async () => {
    await loadInterfaceCatalog('en');
    await loadRowMenuCatalog('en');
    const labels = rowMenuItems({ flags, unread: true, language: 'en', doors }).map((i) => i.label);
    expect(labels).toEqual(['Pin', 'Mute', 'Search', 'Read', 'Reading mode', 'Archive']);
  });
});

describe('rowReadingModeMenu — la loi du fil, lue pour une ligne', () => {
  test('un groupe de quatre, connecté, sans préférence : Focal, Script, Bulles et Résumé ouverts, la Rivière motivée', () => {
    const menu = rowReadingModeMenu({
      conversation: { type: 'group', memberCount: 4 },
      isAnonymous: false,
      sticky: null,
      language: 'fr',
      readingModesEnabled: true,
    });
    expect(menu.sticky).toBeNull();
    expect(menu.rows.map((row) => [row.mode, row.isAvailable])).toEqual([
      ['focal', true],
      ['script', true],
      ['bubbles', true],
      ['summary', true],
      ['river', false],
    ]);
    expect(menu.rows.find((row) => row.mode === 'river')?.reason).not.toBeNull();
  });

  test('un invité ne choisit pas le Résumé — la raison est la sienne, pas « Indisponible »', () => {
    const menu = rowReadingModeMenu({
      conversation: { type: 'direct', memberCount: 2 },
      isAnonymous: true,
      sticky: 'script',
      language: 'fr',
      readingModesEnabled: true,
    });
    const summary = menu.rows.find((row) => row.mode === 'summary');
    expect(summary?.isAvailable).toBe(false);
    expect(summary?.reason).toBe('Réservé aux lecteurs connectés');
    expect(menu.sticky).toBe('script');
  });
});

describe('rowSubmenuItems — le sous-menu Mode de lecture', () => {
  const base = { favorite: undefined, categoryId: undefined, categories: [], language: 'fr' } as const;

  test('« Automatique » en tête, cochée sans préférence ; chaque mode écrit sa préférence, Automatique l’efface', () => {
    const readingMode = rowReadingModeMenu({ conversation: { type: 'group', memberCount: 4 }, isAnonymous: false, sticky: null, language: 'fr', readingModesEnabled: true });
    const items = rowSubmenuItems({ ...base, submenu: 'readingMode', readingMode });
    expect(items.map((i) => [i.label, i.checked, i.choice])).toEqual([
      ['Automatique', true, { kind: 'readingMode', mode: null }],
      ['Focal', false, { kind: 'readingMode', mode: 'focal' }],
      ['Script', false, { kind: 'readingMode', mode: 'script' }],
      ['Bulles', false, { kind: 'readingMode', mode: 'bubbles' }],
      ['Résumé', false, { kind: 'readingMode', mode: 'summary' }],
      ['Rivière', false, { kind: 'readingMode', mode: 'river' }],
    ]);
  });

  test('la préférence posée est cochée, Automatique ne l’est plus', () => {
    const readingMode = rowReadingModeMenu({ conversation: { type: 'group', memberCount: 4 }, isAnonymous: false, sticky: 'bubbles', language: 'fr', readingModesEnabled: true });
    const checked = rowSubmenuItems({ ...base, submenu: 'readingMode', readingMode }).filter((i) => i.checked).map((i) => i.label);
    expect(checked).toEqual(['Bulles']);
  });

  test('un mode indisponible reste LISTÉ, désactivé, avec sa vraie raison — jamais retiré', () => {
    const readingMode = rowReadingModeMenu({ conversation: { type: 'group', memberCount: 4 }, isAnonymous: false, sticky: null, language: 'fr', readingModesEnabled: true });
    const river = rowSubmenuItems({ ...base, submenu: 'readingMode', readingMode }).find((i) => i.key === 'river');
    expect(river?.disabled).toBe(true);
    expect(river?.detail).toBe(readingMode.rows.find((row) => row.mode === 'river')?.reason ?? '');
    const focal = rowSubmenuItems({ ...base, submenu: 'readingMode', readingMode }).find((i) => i.key === 'focal');
    expect(focal?.disabled).toBeUndefined();
  });

  test('sans menu de mode remis, le sous-menu est vide — jamais une liste fabriquée', () => {
    expect(rowSubmenuItems({ ...base, submenu: 'readingMode' })).toEqual([]);
  });
});
