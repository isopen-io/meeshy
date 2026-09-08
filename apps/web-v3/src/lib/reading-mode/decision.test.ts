import { describe, expect, test } from 'bun:test';

import type { ConversationReadingMode, ReadingModePreference } from '@meeshy/shared/types/reading-modes';

import { resolveThreadMode, threadCapabilities, toStickyPreference, toStoredMode, usesFlatRow } from './decision';

/**
 * LA LOI DE CHOIX DU FIL — comportement par l'API publique, `now` et
 * `lastOpenedAt` toujours INJECTÉS (aucun `Date.now()` implicite).
 */

const BASE = {
  now: new Date('2026-09-07T12:00:00.000Z'),
  isAnonymous: false,
  conversationType: 'group' as const,
};

describe('resolveThreadMode — ouverture par défaut (D-7)', () => {
  test('lecteur inscrit, 0 non-lu, rien de collant ⇒ focal/default', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'auto' }),
    ).toEqual({ mode: 'focal', reason: 'default' });
  });
});

describe('resolveThreadMode — D-8 : un mode élu hors catalogue web retombe sur focal', () => {
  test('26 non-lus (> 25) ⇒ la loi élirait « summary », le catalogue web ne le porte pas ⇒ focal/clamped-unavailable', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 26, lastOpenedAt: BASE.now, sticky: 'auto' }),
    ).toEqual({ mode: 'focal', reason: 'clamped-unavailable' });
  });

  test('25 non-lus (pile au seuil) ⇒ toujours sous le plafond ⇒ focal/default', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 25, lastOpenedAt: BASE.now, sticky: 'auto' }),
    ).toEqual({ mode: 'focal', reason: 'default' });
  });

  test('absence (25 h, 10 non-lus) ⇒ la branche stale-absence élirait « summary » ⇒ focal/clamped-unavailable', () => {
    const lastOpenedAt = new Date(BASE.now.getTime() - 25 * 60 * 60 * 1000);
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 10, lastOpenedAt, sticky: 'auto' }),
    ).toEqual({ mode: 'focal', reason: 'clamped-unavailable' });
  });

  test('présence récente (23 h, 10 non-lus) ⇒ pas absent ⇒ focal/default', () => {
    const lastOpenedAt = new Date(BASE.now.getTime() - 23 * 60 * 60 * 1000);
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 10, lastOpenedAt, sticky: 'auto' }),
    ).toEqual({ mode: 'focal', reason: 'default' });
  });
});

describe('resolveThreadMode — le choix collant', () => {
  test('collant script ⇒ script/sticky', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'script' }),
    ).toEqual({ mode: 'script', reason: 'sticky' });
  });

  test('collant focal ⇒ focal/sticky', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'focal' }),
    ).toEqual({ mode: 'focal', reason: 'sticky' });
  });

  /**
   * LA RÈGLE DE RENDU (miroir `ReadingModeController.renderDecision`) : la loi
   * SEULE rendrait `focal`/`clamped-unavailable` (« bubbles » n'appartient à
   * aucun catalogue drapeau-on) — ce témoin échoue sans la règle de
   * consommation qui l'override.
   */
  test('collant bulles ⇒ bubbles/sticky (règle de rendu, pas la loi seule)', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'bulles' }),
    ).toEqual({ mode: 'bubbles', reason: 'sticky' });
  });

  test('collant riviere ⇒ mode listé qu\'on ne sait pas rendre ⇒ focal/clamped-unavailable', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'riviere' }),
    ).toEqual({ mode: 'focal', reason: 'clamped-unavailable' });
  });

  test('le collant gagne TOUJOURS sur les branches numériques, y compris > 25 non-lus', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 999, lastOpenedAt: null, sticky: 'script' }),
    ).toEqual({ mode: 'script', reason: 'sticky' });
  });
});

describe('resolveThreadMode — drapeau éteint (VITE_READING_MODES=off)', () => {
  /**
   * PARAMÈTRE DE CONSTRUCTION, jamais un toggle : `readingModesEnabled` entre
   * par l'ENTRÉE (défaut `apiConfig.readingModesEnabled` quand absent — non
   * exercé ici, les témoins ci-dessus le couvrent déjà en laissant le champ
   * absent). Miroir `ReadingModeOrchestrator.resolveOrchestratorDecision`
   * (Swift, branche 1) : drapeau éteint ⇒ `bubbles`/`flag-disabled`, JAMAIS
   * clampé, et PRIORITAIRE sur tout choix collant — la table de priorité
   * Swift place cette branche AVANT `stickyChoice`.
   */
  test('drapeau éteint, rien de collant ⇒ bubbles/flag-disabled', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'auto', readingModesEnabled: false }),
    ).toEqual({ mode: 'bubbles', reason: 'flag-disabled' });
  });

  test('collant focal + drapeau éteint ⇒ bubbles/flag-disabled (le drapeau PRIME sur le collant)', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'focal', readingModesEnabled: false }),
    ).toEqual({ mode: 'bubbles', reason: 'flag-disabled' });
  });

  test('collant bulles + drapeau éteint ⇒ bubbles/flag-disabled (la raison est celle de la loi, pas "sticky")', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'bulles', readingModesEnabled: false }),
    ).toEqual({ mode: 'bubbles', reason: 'flag-disabled' });
  });

  test('threadCapabilities({ readingModesEnabled: false }).availableModes est vide — la loi ne rend que bubbles, hors THREAD_RENDERABLE_MODES', () => {
    expect(
      threadCapabilities({ isAnonymous: false, conversationType: 'group', readingModesEnabled: false }).availableModes,
    ).toEqual([]);
  });

  test('le défaut (paramètre absent) reste inchangé — équivalent à readingModesEnabled: true', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'auto' }),
    ).toEqual(
      resolveThreadMode({ ...BASE, unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'auto', readingModesEnabled: true }),
    );
  });
});

describe('resolveThreadMode — horloge injectée', () => {
  test('deux horloges différentes changent la décision sans aucun Date.now() implicite', () => {
    const lastOpenedAt = new Date('2026-09-01T00:00:00.000Z');
    const near = new Date('2026-09-01T10:00:00.000Z'); // 10 h après
    const far = new Date('2026-09-03T00:00:00.000Z'); // 48 h après

    expect(
      resolveThreadMode({ ...BASE, unreadCount: 10, lastOpenedAt, sticky: 'auto', now: near }),
    ).toEqual({ mode: 'focal', reason: 'default' });
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 10, lastOpenedAt, sticky: 'auto', now: far }),
    ).toEqual({ mode: 'focal', reason: 'clamped-unavailable' });
  });

  test('jamais ouverte (lastOpenedAt null) + non-lus ⇒ absence ⇒ clamped-unavailable', () => {
    expect(
      resolveThreadMode({ ...BASE, unreadCount: 10, lastOpenedAt: null, sticky: 'auto' }),
    ).toEqual({ mode: 'focal', reason: 'clamped-unavailable' });
  });
});

describe('resolveThreadMode — identité et type de conversation', () => {
  test('un invité reçoit la même décision par défaut (summary hors catalogue web pour tout le monde)', () => {
    expect(
      resolveThreadMode({ ...BASE, isAnonymous: true, unreadCount: 26, lastOpenedAt: BASE.now, sticky: 'auto' }),
    ).toEqual({ mode: 'focal', reason: 'clamped-unavailable' });
  });

  test('une conversation directe suit la même loi de choix', () => {
    expect(
      resolveThreadMode({ ...BASE, conversationType: 'direct', unreadCount: 0, lastOpenedAt: BASE.now, sticky: 'auto' }),
    ).toEqual({ mode: 'focal', reason: 'default' });
  });
});

describe('usesFlatRow', () => {
  test('focal et script partagent la rangée plate', () => {
    expect(usesFlatRow('focal')).toBe(true);
    expect(usesFlatRow('script')).toBe(true);
  });

  test('bubbles, summary, river ne sont pas la rangée plate', () => {
    expect(usesFlatRow('bubbles')).toBe(false);
    expect(usesFlatRow('summary')).toBe(false);
    expect(usesFlatRow('river')).toBe(false);
  });
});

describe('toStickyPreference / toStoredMode — aller-retour TOTAL', () => {
  test('null (rien de mémorisé) ⇔ auto', () => {
    expect(toStickyPreference(null)).toBe('auto');
    expect(toStoredMode('auto')).toBeNull();
  });

  test('chaque mode rendu a sa préférence, et réciproquement', () => {
    /* Typé des DEUX côtés : un `as never` sur le mode rendrait l'aller-retour
       vert même si les deux tables cessaient de se correspondre. */
    const pairs: readonly (readonly [Exclude<ReadingModePreference, 'auto'>, ConversationReadingMode])[] = [
      ['focal', 'focal'],
      ['script', 'script'],
      ['resume', 'summary'],
      ['riviere', 'river'],
      ['bulles', 'bubbles'],
    ];
    for (const [preference, mode] of pairs) {
      expect(toStoredMode(preference)).toBe(mode);
      expect(toStickyPreference(mode)).toBe(preference);
    }
  });
});
