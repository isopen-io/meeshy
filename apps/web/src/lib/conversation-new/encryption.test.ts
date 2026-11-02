import { describe, expect, test } from 'bun:test';

import { chosenCreationMode, webCreationEncryptionOffer, WEB_END_TO_END_SUPPORTED } from './encryption';

/**
 * LE CHOIX DU CHIFFREMENT À LA CRÉATION, SUR LE WEB (décision du 2026-11-01,
 * `packages/shared/decisions/2026-11-01-le-mode-de-chiffrement-se-choisit-a-la-creation.md`).
 *
 * Depuis #14592 le web lit et écrit un tête-à-tête chiffré de bout en bout : la
 * loi partagée (`creationEncryptionOffer`) y est appelée avec `endToEndSupported: true`.
 * Ce qui en résulte, rôle par rôle et type par type, est ce que l'écran montre.
 */
const modes = (offer: ReturnType<typeof webCreationEncryptionOffer>) => offer.choices.map((choice) => choice.mode);

describe('le web chiffre de bout en bout (libsignal en WASM, #14592)', () => {
  test('la loi partagée est appelée en le disant', () => {
    expect(WEB_END_TO_END_SUPPORTED).toBe(true);
  });
});

describe('un utilisateur ordinaire voit Serveur et Hybride, Serveur présélectionné', () => {
  for (const platformRole of [null, 'USER', 'AGENT']) {
    for (const conversationType of ['direct', 'group'] as const) {
      test(`${String(platformRole)} · ${conversationType}`, () => {
        const offer = webCreationEncryptionOffer({ platformRole, conversationType });
        expect(modes(offer)).toEqual(['server', 'hybrid']);
        expect(offer.choices.every((choice) => choice.available)).toBe(true);
        expect(offer.defaultMode).toBe('server');
      });
    }
  }
});

describe('ANALYST et plus voient le bout en bout : disponible en tête-à-tête, grisé pour un groupe', () => {
  for (const platformRole of ['ANALYST', 'AUDIT', 'MODERATOR', 'ADMIN', 'BIGBOSS']) {
    test(`${platformRole} · tête-à-tête : disponible, et présélectionné par la loi partagée`, () => {
      const offer = webCreationEncryptionOffer({ platformRole, conversationType: 'direct' });
      expect(offer.choices.at(-1)).toEqual({ mode: 'e2ee', available: true, unavailability: null });
      expect(offer.defaultMode).toBe('e2ee');
    });

    test(`${platformRole} · groupe : « bientôt pour les groupes »`, () => {
      const offer = webCreationEncryptionOffer({ platformRole, conversationType: 'group' });
      expect(offer.choices.at(-1)).toEqual({ mode: 'e2ee', available: false, unavailability: 'groups-not-yet' });
      expect(offer.defaultMode).toBe('server');
    });
  }
});

describe('le mode envoyé est toujours un mode offert ET disponible', () => {
  const analyst = webCreationEncryptionOffer({ platformRole: 'ANALYST', conversationType: 'direct' });
  const user = webCreationEncryptionOffer({ platformRole: 'USER', conversationType: 'direct' });

  test('sans geste, le défaut', () => {
    expect(chosenCreationMode(user, null)).toBe('server');
  });

  test('le geste de l’utilisateur est suivi', () => {
    expect(chosenCreationMode(user, 'hybrid')).toBe('hybrid');
  });

  test('le bout en bout choisi en tête-à-tête part', () => {
    expect(chosenCreationMode(analyst, 'e2ee')).toBe('e2ee');
  });

  test('un mode grisé ne part jamais : retour au défaut', () => {
    const group = webCreationEncryptionOffer({ platformRole: 'ANALYST', conversationType: 'group' });
    expect(chosenCreationMode(group, 'e2ee')).toBe('server');
  });

  test('un mode qui n’est pas offert ne part jamais', () => {
    expect(chosenCreationMode(user, 'e2ee')).toBe('server');
  });
});
