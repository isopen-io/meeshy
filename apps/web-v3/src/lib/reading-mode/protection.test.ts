import { describe, expect, test } from 'bun:test';

import {
  ephemeralOf,
  formatRemaining,
  protectionOf,
  requiresConsume,
  rendersContent,
  reveal,
  settle,
  settleFog,
  showsAffordance,
  surrogateOf,
} from './protection';
import type { ProtectionKind, RevealPhase } from './protection';

/**
 * `exactOptionalPropertyTypes` refuse `deletedAt: undefined` — les champs
 * optionnels s'OMETTENT, ils ne se posent jamais à `undefined`. `fields()`
 * part d'une base « rien de protégé » et ne surcharge que ce que le test
 * nomme.
 */
const fields = (
  overrides: Partial<{ deletedAt: Date; isViewOnce: boolean; viewOnceCount: number; isBlurred: boolean; expiresAt: Date }> = {},
): { deletedAt?: Date; isViewOnce: boolean; viewOnceCount: number; isBlurred: boolean; expiresAt?: Date } => ({
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  ...overrides,
});

describe("protectionOf — le kind, dans l'ordre d'iOS", () => {
  test('deletedAt posé ET vue unique consommée ET flouté ⇒ deleted (supprimé gagne)', () => {
    expect(
      protectionOf(fields({ deletedAt: new Date(0), isViewOnce: true, viewOnceCount: 1, isBlurred: true }), 1000),
    ).toBe('deleted');
  });

  test('vue unique consommée ⇒ burned, même isBlurred: false, même pour l’émetteur', () => {
    expect(protectionOf(fields({ isViewOnce: true, viewOnceCount: 1 }), 1000)).toBe('burned');
  });

  test('expiresAt <= now ⇒ expired', () => {
    expect(protectionOf(fields({ expiresAt: new Date(1000) }), 1000)).toBe('expired');
  });

  test('expiresAt > now ⇒ pas expired (voilé si isBlurred, sinon standard)', () => {
    expect(protectionOf(fields({ expiresAt: new Date(1001) }), 1000)).toBe('standard');
  });

  test('isBlurred: true seul ⇒ veiled', () => {
    expect(protectionOf(fields({ isBlurred: true }), 1000)).toBe('veiled');
  });

  test('isViewOnce SANS isBlurred, non consommé ⇒ veiled (forme SDK declaredProtection, fail-closed)', () => {
    expect(protectionOf(fields({ isViewOnce: true, viewOnceCount: 0 }), 1000)).toBe('veiled');
  });

  test('tout à false/absent ⇒ standard', () => {
    expect(protectionOf(fields(), 1000)).toBe('standard');
  });

  /**
   * Second verrou (défaut 4, revue #5668) : `protectionOf` reste
   * fail-closed même si une charge NON DÉCODÉE — un `null` explicite tel
   * que la passerelle le sert, que `decodeMessage` est censé retirer —
   * l'atteint malgré tout. `!= null` plutôt que `!== undefined`.
   */
  test("charge NON décodée : deletedAt/expiresAt à `null` (jamais `undefined`) ⇒ standard, pas deleted/expired", () => {
    const rawFromGateway = { ...fields(), deletedAt: null, expiresAt: null } as unknown as {
      deletedAt?: Date;
      isViewOnce: boolean;
      viewOnceCount: number;
      isBlurred: boolean;
      expiresAt?: Date;
    };
    expect(protectionOf(rawFromGateway, 1000)).toBe('standard');
  });
});

describe('ephemeralOf / formatRemaining', () => {
  test('expiresAt absent ⇒ none', () => {
    expect(ephemeralOf(undefined, 1000)).toEqual({ state: 'none' });
  });

  test('expiresAt dans 7s ⇒ running(7)', () => {
    expect(ephemeralOf(new Date(8000), 1000)).toEqual({ state: 'running', remainingSeconds: 7 });
  });

  test('expiresAt dans le passé ⇒ expired', () => {
    expect(ephemeralOf(new Date(999), 1000)).toEqual({ state: 'expired' });
  });

  test('expiresAt === now ⇒ expired (le seuil est inclusif)', () => {
    expect(ephemeralOf(new Date(1000), 1000)).toEqual({ state: 'expired' });
  });

  const FORMAT_CASES: readonly (readonly [number, string])[] = [
    [7, '7s'],
    [65, '1m 05s'],
    [7380, '2h 03m'],
    [59, '59s'],
    [0, '0s'],
    [-3, '0s'],
  ];
  for (const [seconds, expected] of FORMAT_CASES) {
    test(`formatRemaining(${seconds}) === ${JSON.stringify(expected)}`, () => {
      expect(formatRemaining(seconds)).toBe(expected);
    });
  }
});

describe('reveal — hidden → revealed(until) → fogging(until,next) → hidden | consumed', () => {
  test('hidden ⇒ revealed(until = now + 5s)', () => {
    expect(reveal({ phase: 'hidden' }, { now: 1000 })).toEqual({ phase: 'revealed', until: 6000 });
  });

  test('settle : avant `until`, inchangé', () => {
    expect(settle({ phase: 'revealed', until: 6000 }, { now: 5999, isViewOnce: false })).toEqual({
      phase: 'revealed',
      until: 6000,
    });
  });

  /**
   * `settle` n'atterrit plus directement sur `hidden`/`consumed` (revue
   * #5676, défaut 5) : la fenêtre s'éteint dans `fogging`, où le brouillard
   * ferme sur le contenu ENCORE monté (`rendersContent` le couvre) —
   * `settleFog` achève le passage 400 ms plus tard.
   */
  test('settle : à `until`, fogging → hidden (message non vue-unique)', () => {
    expect(settle({ phase: 'revealed', until: 6000 }, { now: 6000, isViewOnce: false })).toEqual({
      phase: 'fogging',
      until: 6400,
      next: 'hidden',
    });
  });

  test('settle : à `until`, fogging → consumed (vue unique)', () => {
    expect(settle({ phase: 'revealed', until: 6000 }, { now: 6000, isViewOnce: true })).toEqual({
      phase: 'fogging',
      until: 6400,
      next: 'consumed',
    });
  });

  test('settleFog : avant `until`, inchangé', () => {
    expect(settleFog({ phase: 'fogging', until: 6400, next: 'hidden' }, { now: 6399 })).toEqual({
      phase: 'fogging',
      until: 6400,
      next: 'hidden',
    });
  });

  test('settleFog : à `until`, hidden', () => {
    expect(settleFog({ phase: 'fogging', until: 6400, next: 'hidden' }, { now: 6400 })).toEqual({ phase: 'hidden' });
  });

  test('settleFog : à `until`, consumed', () => {
    expect(settleFog({ phase: 'fogging', until: 6400, next: 'consumed' }, { now: 6400 })).toEqual({
      phase: 'consumed',
    });
  });

  test('settleFog : ignore toute autre phase', () => {
    expect(settleFog({ phase: 'hidden' }, { now: 6400 })).toEqual({ phase: 'hidden' });
    expect(settleFog({ phase: 'revealed', until: 6000 }, { now: 6400 })).toEqual({ phase: 'revealed', until: 6000 });
  });

  test('reveal(consumed) ⇒ consumed (une vue unique révélée une fois ne se révèle plus)', () => {
    expect(reveal({ phase: 'consumed' }, { now: 9000 })).toEqual({ phase: 'consumed' });
  });

  test('reveal(revealed) ⇒ inchangé (aucune affordance pendant la fenêtre)', () => {
    expect(reveal({ phase: 'revealed', until: 6000 }, { now: 5500 })).toEqual({ phase: 'revealed', until: 6000 });
  });

  test('reveal(fogging) ⇒ inchangé (aucune affordance pendant la fermeture)', () => {
    expect(reveal({ phase: 'fogging', until: 6400, next: 'hidden' }, { now: 6200 })).toEqual({
      phase: 'fogging',
      until: 6400,
      next: 'hidden',
    });
  });

  test('requiresConsume', () => {
    expect(requiresConsume({ isViewOnce: true })).toBe(true);
    expect(requiresConsume({ isViewOnce: false })).toBe(false);
  });
});

describe('rendersContent / showsAffordance — la matrice kind × phase', () => {
  const hidden = { phase: 'hidden' as const };
  const revealed = { phase: 'revealed' as const, until: 6000 };
  const fogging = { phase: 'fogging' as const, until: 6400, next: 'hidden' as const };
  const foggingToConsumed = { phase: 'fogging' as const, until: 6400, next: 'consumed' as const };
  const consumed = { phase: 'consumed' as const };

  const RENDERS_CASES: readonly (readonly [ProtectionKind, RevealPhase, boolean])[] = [
    ['standard', hidden, true],
    ['standard', revealed, true],
    ['standard', fogging, true],
    ['standard', consumed, true],
    ['veiled', hidden, false],
    ['veiled', revealed, true],
    ['veiled', fogging, true],
    ['veiled', consumed, false],
    ['burned', hidden, false],
    ['burned', revealed, true],
    ['burned', foggingToConsumed, true],
    ['burned', consumed, false],
    ['deleted', hidden, false],
    ['deleted', revealed, false],
    ['deleted', fogging, false],
    ['deleted', consumed, false],
    ['expired', hidden, false],
    ['expired', revealed, false],
    ['expired', fogging, false],
    ['expired', consumed, false],
  ];
  for (const [kind, phase, expected] of RENDERS_CASES) {
    test(`rendersContent(${kind}, ${phase.phase}) === ${expected}`, () => {
      expect(rendersContent(kind, phase)).toBe(expected);
    });
  }

  test('showsAffordance : SEULEMENT veiled + hidden — jamais pendant fogging', () => {
    expect(showsAffordance('veiled', hidden)).toBe(true);
    expect(showsAffordance('veiled', revealed)).toBe(false);
    expect(showsAffordance('veiled', fogging)).toBe(false);
    expect(showsAffordance('burned', hidden)).toBe(false);
    expect(showsAffordance('standard', hidden)).toBe(false);
  });
});

describe('surrogateOf — le substitut ne transporte rien du contenu', () => {
  const content = 'Le code du coffre est 4817-2290.';

  test('aucun caractère alphanumérique du contenu, ne contient pas « 4817 »', () => {
    const surrogate = surrogateOf(content.length);
    expect(/[a-zA-Z0-9]/.test(surrogate)).toBe(false);
    expect(surrogate).not.toContain('4817');
  });

  /**
   * La cible est la LARGEUR OCCUPÉE, pas le nombre de caractères : un `▇`
   * avance deux fois plus qu'une lettre latine (`SURROGATE_ADVANCE_RATIO`).
   * La borne porte donc sur la MOITIÉ de la longueur, plus un pas de 8 et les
   * espaces qui séparent les blocs.
   */
  test('la largeur visée est la MOITIÉ de la longueur, à un pas de 8 près', () => {
    const surrogate = surrogateOf(content.length);
    const half = content.length / 2;
    expect(surrogate.length).toBeGreaterThanOrEqual(half - 8);
    expect(surrogate.length).toBeLessThanOrEqual(half + 8);
  });

  test('déterministe : deux appels avec la même longueur rendent la même sortie', () => {
    expect(surrogateOf(content.length)).toBe(surrogateOf(content.length));
  });

  test('deux contenus de même longueur ⇒ même substitut (la longueur est la SEULE information)', () => {
    const other = 'On se voit demain a neuf heures.';
    expect(other.length).toBe(content.length);
    expect(surrogateOf(other.length)).toBe(surrogateOf(content.length));
  });

  /**
   * LE SUBSTITUT OCCUPE LA PLACE DU CONTENU, PAS DAVANTAGE (revue) — un `▇`
   * avance d'un cadratin quand une lettre latine avance d'un demi : autant de
   * blocs que de caractères doublait la hauteur du voile et faisait sauter le
   * fil à la révélation. Le témoin porte sur le RAPPORT, jamais sur un nombre
   * gravé : c'est lui qui rougirait si quelqu'un revenait à « un bloc par
   * caractère ».
   */
  test('un substitut n’occupe jamais plus de blocs que la moitié du contenu (+ un pas de 8)', () => {
    for (const length of [24, 60, 120, 300]) {
      const blocks = surrogateOf(length).replace(/ /g, '').length;
      expect(blocks).toBeLessThanOrEqual(Math.round(length / 2) + 8);
      expect(blocks).toBeGreaterThan(0);
    }
  });
});
