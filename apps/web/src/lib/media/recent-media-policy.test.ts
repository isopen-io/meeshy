import { describe, expect, test } from 'bun:test';

import { RECENT_MEDIA_POLICY, recentMediaAdmission, recentMediaEvictions, recentMediaResponseAdmission } from './recent-media-policy';

/**
 * #11326 (défaut retenu de #11253 : 3 jours, Wi-Fi seulement, 500 Mo) — UN
 * MÉDIA VU RÉCEMMENT RESTE LISIBLE HORS LIGNE. Ce qui entre dans le seau
 * « récents », et ce qui en sort : la loi, sans réseau ni stockage.
 */
const WIFI = { type: 'wifi' } as const;
const SRC = 'https://gate.meeshy.me/api/v1/attachments/file/2026/10/reel.mp4';
const MB = 1024 * 1024;

describe('RECENT_MEDIA_POLICY — le défaut retenu de #11253', () => {
  test('trois jours, cinq cents mégaoctets', () => {
    expect(RECENT_MEDIA_POLICY.maxAgeMs).toBe(3 * 24 * 60 * 60 * 1000);
    expect(RECENT_MEDIA_POLICY.budgetBytes).toBe(500 * MB);
  });
});

describe('recentMediaAdmission — ce qui peut être gardé', () => {
  test('un média ordinaire vu sur le Wi-Fi est gardé', () => {
    expect(recentMediaAdmission({ src: SRC, protection: 'none', connection: WIFI })).toEqual({ admit: true });
  });

  test('l’Ethernet vaut le Wi-Fi : aucun forfait n’est entamé', () => {
    expect(recentMediaAdmission({ src: SRC, protection: 'none', connection: { type: 'ethernet' } })).toEqual({ admit: true });
  });

  test('vue unique, flouté, éphémère : jamais (#9478)', () => {
    expect(recentMediaAdmission({ src: SRC, protection: 'protected', connection: WIFI })).toEqual({ admit: false, reason: 'protected' });
  });

  test('sur le réseau mobile, rien ne se télécharge en plus', () => {
    expect(recentMediaAdmission({ src: SRC, protection: 'none', connection: { type: 'cellular' } })).toEqual({ admit: false, reason: 'not-wifi' });
  });

  test('un réseau qu’on ne connaît pas n’est pas présumé Wi-Fi (fail-closed)', () => {
    expect(recentMediaAdmission({ src: SRC, protection: 'none', connection: undefined })).toEqual({ admit: false, reason: 'not-wifi' });
    expect(recentMediaAdmission({ src: SRC, protection: 'none', connection: {} })).toEqual({ admit: false, reason: 'not-wifi' });
  });

  test('« économiser les données » l’emporte sur le Wi-Fi', () => {
    expect(recentMediaAdmission({ src: SRC, protection: 'none', connection: { type: 'wifi', saveData: true } })).toEqual({ admit: false, reason: 'save-data' });
  });

  test('une adresse qui porte une signature ou un jeton n’est jamais gardée (#9600)', () => {
    expect(recentMediaAdmission({ src: `${SRC}?sig=abc&exp=1`, protection: 'none', connection: WIFI })).toEqual({ admit: false, reason: 'signed-url' });
  });

  test('un média local (blob:, data:) ou déchiffré sur l’appareil n’a rien à faire dans le seau', () => {
    expect(recentMediaAdmission({ src: 'blob:https://meeshy.me/1', protection: 'none', connection: WIFI })).toEqual({ admit: false, reason: 'not-http' });
    expect(recentMediaAdmission({ src: 'data:video/mp4;base64,AAAA', protection: 'none', connection: WIFI })).toEqual({ admit: false, reason: 'not-http' });
  });
});

describe('recentMediaResponseAdmission — ce que la passerelle laisse garder', () => {
  const ok = { status: 200, cacheControl: 'private, max-age=31536000', contentLength: 12 * MB };

  test('une réponse entière ordinaire entre', () => {
    expect(recentMediaResponseAdmission(ok)).toBe(true);
  });

  test('no-store (vue unique) et no-cache (éphémère) n’entrent pas (#9478)', () => {
    expect(recentMediaResponseAdmission({ ...ok, cacheControl: 'private, no-store' })).toBe(false);
    expect(recentMediaResponseAdmission({ ...ok, cacheControl: 'private, no-cache' })).toBe(false);
  });

  test('une tranche (206) ou un refus n’entrent pas : seul le fichier ENTIER sert les plages', () => {
    expect(recentMediaResponseAdmission({ ...ok, status: 206 })).toBe(false);
    expect(recentMediaResponseAdmission({ ...ok, status: 404 })).toBe(false);
  });

  test('un fichier plus gros que le budget, ou de taille inconnue, n’entre pas', () => {
    expect(recentMediaResponseAdmission({ ...ok, contentLength: 501 * MB })).toBe(false);
    expect(recentMediaResponseAdmission({ ...ok, contentLength: null })).toBe(false);
  });
});

describe('recentMediaEvictions — le seau reste borné', () => {
  const NOW = Date.parse('2026-10-23T12:00:00Z');
  const entry = (url: string, ageHours: number, mb: number) => ({ url, storedAt: NOW - ageHours * 3_600_000, bytes: mb * MB });

  test('ce qui a plus de trois jours sort', () => {
    expect(recentMediaEvictions({ entries: [entry('a', 73, 1), entry('b', 71, 1)], now: NOW, incomingBytes: 0 })).toEqual(['a']);
  });

  test('pour faire place, le plus ANCIEN sort d’abord, et rien de plus que nécessaire', () => {
    const entries = [entry('neuf', 1, 200), entry('vieux', 30, 200), entry('moyen', 10, 50)];
    expect(recentMediaEvictions({ entries, now: NOW, incomingBytes: 100 * MB })).toEqual(['vieux']);
  });

  test('une entrée sans date d’écriture lisible est traitée comme expirée', () => {
    expect(recentMediaEvictions({ entries: [{ url: 'x', storedAt: Number.NaN, bytes: MB }], now: NOW, incomingBytes: 0 })).toEqual(['x']);
  });
});
