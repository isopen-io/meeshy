import { describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';

import { FAVORITE_EMOJIS, rowMenuItems, rowSubmenuItems, type RowMenuMore } from './row-actions';

/**
 * LE MENU D'UNE LIGNE PORTE LES ENTRÉES D'iOS (#10593) — Détails, Renommer
 * hors direct, Favori ›, Déplacer vers… ›, Bloquer/Débloquer en direct
 * (`ConversationListView+Overlays.swift:79-366`).
 */
const flags = { isPinned: false, isMuted: false, isArchived: false };

const more = (partial: Partial<RowMenuMore>): RowMenuMore => ({
  details: true,
  rename: false,
  organize: true,
  favorite: undefined,
  block: null,
  ...partial,
});

describe('rowMenuItems — les entrées d’iOS, à leur place', () => {
  test('un groupe : Détails, Renommer, Favori ›, Déplacer vers… › entre « Lu » et « Archiver »', () => {
    const items = rowMenuItems({ flags, unread: false, language: 'fr', canCall: true, canDelete: true, more: more({ rename: true }) });
    expect(items.map((i) => i.id)).toEqual(['callAudio', 'callVideo', 'pin', 'mute', 'read', 'details', 'rename', 'favorite', 'moveTo', 'archive', 'delete']);
    expect(items.filter((i) => i.submenu !== undefined).map((i) => [i.id, i.submenu])).toEqual([
      ['favorite', 'favorite'],
      ['moveTo', 'moveTo'],
    ]);
    expect(items.find((i) => i.id === 'moveTo')?.label).toBe('Déplacer vers…');
  });

  test('un direct : pas de Renommer, « Bloquer » en rouge avant « Supprimer »', () => {
    const items = rowMenuItems({ flags, unread: false, language: 'fr', canDelete: true, more: more({ block: 'block' }) });
    expect(items.map((i) => i.id)).toEqual(['pin', 'mute', 'read', 'details', 'favorite', 'moveTo', 'archive', 'block', 'delete']);
    expect(items.find((i) => i.id === 'block')).toMatchObject({ label: 'Bloquer', destructive: true });
  });

  test('un pair déjà bloqué : « Débloquer », sans rouge', () => {
    const block = rowMenuItems({ flags, unread: false, language: 'fr', more: more({ block: 'unblock' }) }).find((i) => i.id === 'block');
    expect(block?.label).toBe('Débloquer');
    expect(block?.destructive).toBeUndefined();
  });

  test('un favori posé change le glyphe de l’entrée, comme `star.fill` d’iOS', () => {
    const items = rowMenuItems({ flags, unread: false, language: 'fr', more: more({ favorite: '🔥' }) });
    expect(items.find((i) => i.id === 'favorite')?.glyph).toBe('starFill');
  });

  test('un visiteur sans compte : ni fiche, ni rangement, ni blocage', () => {
    const items = rowMenuItems({ flags, unread: false, language: 'fr', more: more({ details: false, organize: false }) });
    expect(items.map((i) => i.id)).toEqual(['pin', 'mute', 'read', 'archive']);
  });

  test('en anglais, les mots d’iOS', async () => {
    await loadInterfaceCatalog('en');
    await loadRowMenuCatalog('en');
    const labels = rowMenuItems({ flags, unread: false, language: 'en', more: more({ rename: true, block: 'unblock' }) }).map((i) => i.label);
    expect(labels).toEqual(['Pin', 'Mute', 'Unread', 'Details', 'Rename', 'Favorite', 'Move to…', 'Archive', 'Unblock']);
  });
});

describe('rowSubmenuItems — Favori et Déplacer vers…', () => {
  test('le favori : les huit emojis d’iOS, sans « Retirer » tant que rien n’est posé', () => {
    const items = rowSubmenuItems({ submenu: 'favorite', favorite: undefined, categoryId: undefined, categories: [], language: 'fr' });
    expect(FAVORITE_EMOJIS).toEqual(['⭐️', '❤️', '🔥', '💎', '🎯', '✨', '🏆', '💡']);
    expect(items.map((i) => i.label)).toEqual([...FAVORITE_EMOJIS]);
    expect(items.every((i) => i.checked === false)).toBe(true);
  });

  test('un favori posé : coché, et « Retirer le favori » en rouge à la fin', () => {
    const items = rowSubmenuItems({ submenu: 'favorite', favorite: '🔥', categoryId: undefined, categories: [], language: 'fr' });
    expect(items.find((i) => i.label === '🔥')?.checked).toBe(true);
    expect(items.at(-1)).toMatchObject({ label: 'Retirer le favori', destructive: true, choice: { kind: 'favorite', emoji: null } });
  });

  test('déplacer : les catégories dans leur ordre, puis « Mes conversations » — la courante cochée, la retoucher la vide (iOS)', () => {
    const categories = [
      { id: 'cat-a', name: 'Travail' },
      { id: 'cat-b', name: 'Proches' },
    ];
    const items = rowSubmenuItems({ submenu: 'moveTo', favorite: undefined, categoryId: 'cat-b', categories, language: 'fr' });
    expect(items.map((i) => [i.label, i.checked, i.choice])).toEqual([
      ['Travail', false, { kind: 'moveTo', categoryId: 'cat-a' }],
      ['Proches', true, { kind: 'moveTo', categoryId: null }],
      ['Mes conversations', false, { kind: 'moveTo', categoryId: null }],
    ]);
  });

  test('sans catégorie, « Mes conversations » est cochée', () => {
    const items = rowSubmenuItems({ submenu: 'moveTo', favorite: undefined, categoryId: undefined, categories: [], language: 'fr' });
    expect(items.map((i) => [i.label, i.checked])).toEqual([['Mes conversations', true]]);
  });
});
