import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { profilePresenceLine } from './presence-line';

/**
 * LA PRÉSENCE SUR LA FICHE D'UN AMI (#9063) — la pastille et « vu il y a X »,
 * miroir de `RelativeTimeFormatter.lastSeenString`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Utils/RelativeTimeFormatter.swift`).
 * La fiche ne peint que ce que la passerelle a SERVI : `null` ne rend rien.
 */

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
});

const NOW = new Date(2026, 9, 1, 15, 0, 0);
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const at = (day: number, hour: number, minute: number) => new Date(2026, 8, day, hour, minute).toISOString();

describe('profilePresenceLine', () => {
  test('rien de servi (non-ami, présence masquée) : rien à peindre', () => {
    expect(profilePresenceLine(null, NOW, 'fr')).toBeNull();
  });

  test('connecté : pastille verte et « En ligne »', () => {
    expect(profilePresenceLine({ isOnline: true, lastActiveAt: null }, NOW, 'fr')).toEqual({
      status: 'online',
      label: 'En ligne',
    });
  });

  test('actif il y a quelques minutes : la pastille décroît, la date le dit', () => {
    expect(profilePresenceLine({ isOnline: false, lastActiveAt: ago(2) }, NOW, 'fr')).toEqual({
      status: 'away',
      label: 'Vu il y a 2 minutes',
    });
  });

  test('plus tôt dans la journée : en heures, sans pastille', () => {
    expect(profilePresenceLine({ isOnline: false, lastActiveAt: ago(180) }, NOW, 'fr')).toEqual({
      status: 'offline',
      label: 'Vu il y a 3 heures',
    });
  });

  test('hier, avant-hier, puis la date — avec l’heure', () => {
    expect(profilePresenceLine({ isOnline: false, lastActiveAt: at(30, 22, 5) }, NOW, 'fr')?.label).toBe('Vu hier à 22:05');
    expect(profilePresenceLine({ isOnline: false, lastActiveAt: at(29, 9, 30) }, NOW, 'fr')?.label).toBe(
      'Vu avant-hier à 09:30',
    );
    expect(profilePresenceLine({ isOnline: false, lastActiveAt: at(20, 9, 30) }, NOW, 'fr')?.label).toMatch(
      /^Vu le 20 sept\.? à 09:30$/,
    );
  });

  test('`showLastSeen` coupé et hors ligne : ni date ni pastille, donc rien', () => {
    expect(profilePresenceLine({ isOnline: false, lastActiveAt: null }, NOW, 'fr')).toBeNull();
  });

  test('chaque langue d’interface a son libellé — jamais la clé brute', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const line = profilePresenceLine({ isOnline: false, lastActiveAt: ago(2) }, NOW, language);
      expect(line?.label).not.toContain('userProfile.');
      expect(line?.label).not.toContain('{');
    }
  });
});
