import { describe, expect, test } from 'bun:test';

import { LEGACY_DESTINATIONS, legacyHref } from './legacy-link';

/**
 * LES ENTRÉES NON PORTÉES RESTENT ATTEIGNABLES (#5563) — « un réglage qu'on ne
 * trouve plus est un réglage perdu, pas un réglage reporté ». Le legacy sert
 * la production (`https://meeshy.me`) ; ses réglages sont UNE page à onglets
 * qui lit son onglet dans le FRAGMENT (`apps/web/app/settings/page.tsx`,
 * écouteur `hashchange`), la suppression de compte une page à elle
 * (`apps/web/app/account/deletion`).
 */

describe('legacyHref — l’adresse exacte que le legacy sait ouvrir', () => {
  test('les onglets de réglages s’ouvrent par leur fragment', () => {
    expect(legacyHref('security')).toBe('https://meeshy.me/settings#security');
    expect(legacyHref('privacy')).toBe('https://meeshy.me/settings#privacy');
    expect(legacyHref('notification')).toBe('https://meeshy.me/settings#notification');
    expect(legacyHref('media')).toBe('https://meeshy.me/settings#media');
    expect(legacyHref('message')).toBe('https://meeshy.me/settings#message');
  });

  test('la suppression de compte a sa propre page — obligation réglementaire', () => {
    expect(legacyHref('accountDeletion')).toBe('https://meeshy.me/account/deletion');
  });

  test('chaque destination vit sur l’origine de production, en HTTPS', () => {
    for (const destination of LEGACY_DESTINATIONS) {
      expect(new URL(legacyHref(destination)).origin).toBe('https://meeshy.me');
    }
  });
});
