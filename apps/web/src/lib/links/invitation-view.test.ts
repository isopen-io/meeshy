import { describe, expect, test } from 'bun:test';

import type { GuestTerms } from '@/lib/api/link-join';

import {
  anonymousRightsOf,
  askedFieldsOf,
  daysLeft,
  displayUrlOf,
  flagOf,
  joinChoicesOf,
  languageSharesOf,
  remainingPlacesOf,
} from './invitation-view';

/**
 * LES RÈGLES PURES DE LA PAGE D'ACCUEIL D'INVITATION (#7796) — ce que la carte
 * « En anonyme, tu pourras », la ligne de validité, la barre des langues et
 * les choix décident, sans DOM.
 */

const terms = (overrides: Partial<GuestTerms> = {}): GuestTerms => ({
  allowed: true,
  nicknameRequired: true,
  emailRequired: false,
  birthdayRequired: false,
  languages: [],
  mayWrite: true,
  mayImages: true,
  mayFiles: false,
  ...overrides,
});

describe('anonymousRightsOf — les quatre droits, dans l’ordre de la carte', () => {
  test('écrire, images, fichiers, historique — cochés ou barrés selon le lien', () => {
    expect(anonymousRightsOf(terms(), true)).toEqual([
      { right: 'messages', granted: true },
      { right: 'images', granted: true },
      { right: 'files', granted: false },
      { right: 'history', granted: true },
    ]);
  });

  test('un lien en lecture seule barre tout ce qui écrit', () => {
    const rights = anonymousRightsOf(terms({ mayWrite: false, mayImages: false }), false);
    expect(rights.filter((row) => row.granted)).toEqual([]);
  });
});

describe('askedFieldsOf — ce qu’on demandera à l’arrivée', () => {
  test('dans l’ordre prénom, e-mail, date de naissance, et seulement ce que le lien exige', () => {
    expect(askedFieldsOf(terms())).toEqual(['nickname']);
    expect(askedFieldsOf(terms({ nicknameRequired: false, emailRequired: true, birthdayRequired: true }))).toEqual(['email', 'birthday']);
    expect(askedFieldsOf(terms({ nicknameRequired: false }))).toEqual([]);
  });
});

describe('daysLeft — « encore N jours »', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');

  test('sans expiration, aucune limite de durée', () => {
    expect(daysLeft(null, now)).toBeNull();
  });

  test('les jours COMMENCÉS comptent : 6 jours et 1 heure se lisent « encore 7 jours »', () => {
    expect(daysLeft('2026-09-30T13:00:00.000Z', now)).toBe(7);
    expect(daysLeft('2026-09-30T12:00:00.000Z', now)).toBe(6);
  });

  test('moins d’un jour se lit 0 — « expire aujourd’hui » — et un lien échu ne remonte jamais sous zéro', () => {
    expect(daysLeft('2026-09-24T18:00:00.000Z', now)).toBe(0);
    expect(daysLeft('2026-09-20T00:00:00.000Z', now)).toBe(0);
  });
});

describe('remainingPlacesOf — places restantes', () => {
  test('sans maximum : illimité', () => {
    expect(remainingPlacesOf({ expiresAt: null, maxUses: null, currentUses: 40 })).toBeNull();
  });

  test('maximum moins utilisations, jamais négatif', () => {
    expect(remainingPlacesOf({ expiresAt: null, maxUses: 50, currentUses: 12 })).toBe(38);
    expect(remainingPlacesOf({ expiresAt: null, maxUses: 10, currentUses: 12 })).toBe(0);
  });
});

describe('joinChoicesOf — la matrice session × compte requis', () => {
  test('connecté : rejoindre avec son compte, rien d’autre', () => {
    for (const guestAllowed of [true, false]) {
      expect(joinChoicesOf({ signedIn: true, guestAllowed })).toEqual({
        account: true,
        guest: false,
        signIn: false,
        signUp: false,
        accountRequired: false,
      });
    }
  });

  test('visiteur, lien ouvert aux invités : le formulaire, puis se connecter ou créer un compte', () => {
    expect(joinChoicesOf({ signedIn: false, guestAllowed: true })).toEqual({
      account: false,
      guest: true,
      signIn: true,
      signUp: true,
      accountRequired: false,
    });
  });

  test('visiteur, compte requis : aucune porte anonyme, et on le DIT', () => {
    expect(joinChoicesOf({ signedIn: false, guestAllowed: false })).toEqual({
      account: false,
      guest: false,
      signIn: true,
      signUp: true,
      accountRequired: true,
    });
  });
});

describe('languageSharesOf — la barre des langues', () => {
  test('des comptes : des pourcentages entiers qui font 100', () => {
    const shares = languageSharesOf([
      { code: 'fr', count: 1 },
      { code: 'es', count: 1 },
      { code: 'ko', count: 1 },
    ]);
    expect(shares.map((share) => share.percent)).toEqual([34, 33, 33]);
    expect(shares.map((share) => share.weight)).toEqual([1, 1, 1]);
  });

  test('sans comptes : des parts égales pour DESSINER, aucun pourcentage à LIRE', () => {
    const shares = languageSharesOf([
      { code: 'fr', count: null },
      { code: 'en', count: null },
    ]);
    expect(shares).toEqual([
      { code: 'fr', weight: 1, percent: null },
      { code: 'en', weight: 1, percent: null },
    ]);
  });

  test('aucune langue : aucune part', () => {
    expect(languageSharesOf([])).toEqual([]);
  });
});

describe('displayUrlOf et flagOf', () => {
  test('l’adresse se lit sans son protocole', () => {
    expect(displayUrlOf('https://meeshy.me/chat/mshy_Kq7Rb2Xn')).toBe('meeshy.me/chat/mshy_Kq7Rb2Xn');
    expect(displayUrlOf('http://localhost:3100/chat/mshy_x')).toBe('localhost:3100/chat/mshy_x');
  });

  test('un code ISO à deux lettres devient son drapeau ; tout le reste, rien', () => {
    expect(flagOf('sn')).toBe('🇸🇳');
    expect(flagOf('GH')).toBe('🇬🇭');
    expect(flagOf('')).toBeNull();
    expect(flagOf('FRA')).toBeNull();
    expect(flagOf('1A')).toBeNull();
  });
});
