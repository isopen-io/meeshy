import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { foldedSectionUnread, isLensSectionFoldable, lensSectionAccessibleName } from './folded-unread';

/**
 * UNE SECTION REPLIÉE DIT CE QU'ELLE CACHE (#8694) — miroir de
 * `ConversationListView.foldedSectionUnread` (iOS). Repliée, la section ne
 * montre plus les pastilles de ses rangées : le compte de ce qu'elle cache
 * monte à côté de son chevron. Dépliée, les rangées le disent déjà.
 */
describe('foldedSectionUnread', () => {
  test('repliée : la SOMME des non-lus servis par conversation', () => {
    expect(foldedSectionUnread({ unreadCounts: [3, 0, 9], folded: true })).toBe(12);
  });

  test('dépliée : zéro, quelle que soit la dette — les rangées la portent déjà', () => {
    expect(foldedSectionUnread({ unreadCounts: [3, 0, 9], folded: false })).toBe(0);
  });

  test('repliée sans rien à lire : zéro, donc aucune pastille', () => {
    expect(foldedSectionUnread({ unreadCounts: [0, 0], folded: true })).toBe(0);
    expect(foldedSectionUnread({ unreadCounts: [], folded: true })).toBe(0);
  });

  test("un compte négatif ou non fini (remplacement optimiste) n'ampute pas la somme", () => {
    expect(foldedSectionUnread({ unreadCounts: [4, -2, Number.NaN, 1], folded: true })).toBe(5);
  });

  test('aucun plafond dans la loi : « 99+ » est le fait de la pastille, le compte reste exact', () => {
    expect(foldedSectionUnread({ unreadCounts: [80, 70], folded: true })).toBe(150);
  });
});

describe('isLensSectionFoldable', () => {
  test('Épingles se replie — même partition que `isSectionCollapsible` iOS', () => {
    expect(isLensSectionFoldable('pinned')).toBe(true);
  });

  for (const id of ['lentille.live', 'lentille.today', 'lentille.yesterday', 'lentille.thisWeek', 'lentille.older'] as const) {
    test(`${id} est une section CALCULÉE : jamais repliable`, () => {
      expect(isLensSectionFoldable(id)).toBe(false);
    });
  }
});

describe('lensSectionAccessibleName', () => {
  const languages: readonly InterfaceLanguage[] = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'];

  beforeAll(async () => {
    await Promise.all(languages.map((language) => loadInterfaceCatalog(language)));
  });

  test('« Épingles, repliée, 12 messages non lus »', () => {
    expect(lensSectionAccessibleName({ language: 'fr', label: 'Épingles', folded: true, unread: 12 })).toBe(
      'Épingles, repliée, 12 messages non lus',
    );
  });

  test('le singulier est accordé', () => {
    expect(lensSectionAccessibleName({ language: 'fr', label: 'Épingles', folded: true, unread: 1 })).toBe(
      'Épingles, repliée, 1 message non lu',
    );
  });

  test('repliée sans non-lus : le nom et l’état, sans compte', () => {
    expect(lensSectionAccessibleName({ language: 'fr', label: 'Épingles', folded: true, unread: 0 })).toBe('Épingles, repliée');
  });

  test('dépliée : jamais de compte, même si on lui en passe un', () => {
    expect(lensSectionAccessibleName({ language: 'fr', label: 'Épingles', folded: false, unread: 7 })).toBe('Épingles, dépliée');
  });

  test('le compte annoncé est EXACT au-delà de 99 — l’œil lit « 99+ », l’oreille le nombre', () => {
    expect(lensSectionAccessibleName({ language: 'en', label: 'Pinned', folded: true, unread: 150 })).toBe(
      'Pinned, collapsed, 150 unread messages',
    );
  });

  for (const language of languages) {
    test(`${language} : le nom porte la section et le compte, aucune accolade ne fuit`, () => {
      const name = lensSectionAccessibleName({ language, label: 'X', folded: true, unread: 3 });
      expect(name).toContain('X');
      expect(name).toContain('3');
      expect(name).not.toContain('{');
    });
  }
});
