import { describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { ageOf, deviceLabel, formatDays, formatYears } from './member-meta';

const NOW = new Date('2026-09-30T12:00:00.000Z');

describe('ageOf — des années révolues, à la date près', () => {
  test('31 ans le jour de l’anniversaire, 30 la veille', () => {
    expect(ageOf('1995-09-30T00:00:00.000Z', NOW)).toBe(31);
    expect(ageOf('1995-10-01T00:00:00.000Z', NOW)).toBe(30);
  });

  test('une date absente, illisible ou dans le futur n’est pas un âge', () => {
    expect(ageOf(null, NOW)).toBeNull();
    expect(ageOf('', NOW)).toBeNull();
    expect(ageOf('pas une date', NOW)).toBeNull();
    expect(ageOf('2027-01-01T00:00:00.000Z', NOW)).toBeNull();
    expect(ageOf('1800-01-01T00:00:00.000Z', NOW)).toBeNull();
  });
});

describe('deviceLabel — l’appareil en mots, jamais l’agent utilisateur brut', () => {
  const tester = async () => {
    await loadAdminInterfaceCatalog('fr');
    await loadAdminInterfaceCatalog('en');
  };

  test('navigateur (nom propre) + plateforme (traduite)', async () => {
    await tester();
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1', 'fr')).toBe('Safari · iPhone / iPad');
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36', 'fr')).toBe('Chrome · Ordinateur');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36', 'en')).toBe('Chrome · Android');
  });

  test('Edge et Firefox se reconnaissent avant Chrome et Safari', async () => {
    await tester();
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0', 'fr')).toBe('Edge · Ordinateur');
    expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0', 'fr')).toBe('Firefox · Ordinateur');
  });

  test('l’application Meeshy se nomme', async () => {
    await tester();
    expect(deviceLabel('Meeshy/2.4 (iPhone; iOS 17.5)', 'fr')).toBe('Meeshy · iPhone / iPad');
  });

  test('un agent qu’on ne sait pas lire ne s’affiche pas tel quel', async () => {
    await tester();
    expect(deviceLabel('curl/8.0', 'fr')).toBe('Plateforme inconnue');
  });

  test('vide ⇒ null : l’appelant dit « Non renseigné »', () => {
    expect(deviceLabel('', 'fr')).toBeNull();
    expect(deviceLabel(null, 'fr')).toBeNull();
    expect(deviceLabel('   ', 'fr')).toBeNull();
  });
});

describe('durées avec l’unité de la langue', () => {
  /* `Intl` sépare le nombre de l'unité par une espace INSÉCABLE : c'est voulu (elle ne se coupe pas en fin de ligne). */
  const plain = (text: string) => text.replace(/[  ]/g, ' ');

  test('jours et années, pluriels compris', () => {
    expect(plain(formatDays(4, 'fr'))).toBe('4 jours');
    expect(plain(formatDays(1, 'en'))).toBe('1 day');
    expect(plain(formatYears(31, 'fr'))).toBe('31 ans');
    expect(plain(formatYears(31, 'en'))).toBe('31 years');
  });
});
