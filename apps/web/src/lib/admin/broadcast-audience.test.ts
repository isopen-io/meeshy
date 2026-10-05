import { beforeAll, describe, expect, test } from 'bun:test';

import type { AdminBroadcastTargeting } from '@/lib/api/admin-broadcasts';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { audienceSentence, breakdownBars, formatDays } from './broadcast-audience';

/**
 * **L'AUDIENCE, DITE EN UNE PHRASE** (#8876, #6731) — le ciblage est un objet
 * (`activityStatus`, `languages`, `countries`) que personne ne lit ; la fiche le
 * dit comme on le dirait à voix haute. Les langues et les pays sont NOMMÉS dans
 * la langue d'interface, jamais des codes.
 */
beforeAll(async () => {
  await loadAdminInterfaceCatalog('fr');
  await loadAdminInterfaceCatalog('en');
});

/** `Intl` colle le nombre à son unité par une espace INSÉCABLE : on compare les mots, pas le type d'espace. */
const plain = (text: string): string => text.replace(/\s/g, ' ');

const targeting = (overrides: Partial<AdminBroadcastTargeting> = {}): AdminBroadcastTargeting => ({
  activity: 'all',
  inactiveDays: null,
  languages: [],
  countries: [],
  ...overrides,
});

describe('audienceSentence', () => {
  test('aucun filtre : tous les comptes', () => {
    expect(audienceSentence(targeting(), 'fr')).toBe('Tous les comptes');
  });

  test('l’activité seule', () => {
    expect(audienceSentence(targeting({ activity: 'active' }), 'fr')).toBe('Comptes actifs');
    expect(audienceSentence(targeting({ activity: 'new' }), 'fr')).toBe('Comptes créés ces 7 derniers jours');
  });

  test('des comptes inactifs disent depuis combien de temps', () => {
    expect(plain(audienceSentence(targeting({ activity: 'inactive', inactiveDays: 45 }), 'fr'))).toBe('Comptes inactifs depuis 45 jours');
  });

  test('inactifs sans durée servie : la fenêtre par défaut de la passerelle, 30 jours', () => {
    expect(plain(audienceSentence(targeting({ activity: 'inactive' }), 'fr'))).toBe('Comptes inactifs depuis 30 jours');
  });

  test('les langues sont nommées et jointes par « et »', () => {
    expect(audienceSentence(targeting({ languages: ['fr', 'es'] }), 'fr')).toBe('Tous les comptes, en français et espagnol');
  });

  test('les pays sont nommés', () => {
    expect(audienceSentence(targeting({ countries: ['SN', 'FR'] }), 'fr')).toBe('Tous les comptes, pays d’inscription : Sénégal et France');
  });

  test('la phrase complète : activité, langues, pays', () => {
    expect(audienceSentence(targeting({ activity: 'active', languages: ['fr', 'es'], countries: ['SN', 'FR'] }), 'fr')).toBe(
      'Comptes actifs, en français et espagnol, pays d’inscription : Sénégal et France',
    );
  });

  test('trois langues : la liste se sépare par des virgules', () => {
    expect(audienceSentence(targeting({ languages: ['fr', 'es', 'en'] }), 'fr')).toBe('Tous les comptes, en français, espagnol et anglais');
  });

  test('elle suit la langue d’interface', () => {
    expect(audienceSentence(targeting({ activity: 'active', languages: ['fr', 'es'], countries: ['SN', 'FR'] }), 'en')).toBe(
      'Active accounts, in French and Spanish, registered in: Senegal and France',
    );
  });

  test('un code inconnu ne s’affiche jamais tel quel', () => {
    const sentence = audienceSentence(targeting({ languages: ['zz-unknown'], countries: ['ZZ'] }), 'fr');

    expect(sentence).not.toContain('zz-unknown');
    expect(sentence).not.toContain('ZZ');
  });
});

describe('formatDays', () => {
  test('dit des jours dans la langue d’interface, avec le bon pluriel', () => {
    expect(plain(formatDays(1, 'fr'))).toBe('1 jour');
    expect(plain(formatDays(30, 'fr'))).toBe('30 jours');
    expect(plain(formatDays(30, 'en'))).toBe('30 days');
  });
});

describe('breakdownBars — une répartition lisible en barres', () => {
  const entries = [
    { key: 'a', value: 50 },
    { key: 'b', value: 30 },
    { key: 'c', value: 10 },
    { key: 'd', value: 5 },
  ];
  const labelOf = (key: string) => `Nom ${key}`;

  test('nomme chaque barre par son libellé, dans l’ordre donné', () => {
    expect(breakdownBars({ entries, labelOf, othersLabel: 'Autres', limit: 8 })).toEqual([
      { key: 'a', label: 'Nom a', value: 50 },
      { key: 'b', label: 'Nom b', value: 30 },
      { key: 'c', label: 'Nom c', value: 10 },
      { key: 'd', label: 'Nom d', value: 5 },
    ]);
  });

  test('au-delà de la limite, le reste se replie en « Autres », somme exacte', () => {
    const bars = breakdownBars({ entries, labelOf, othersLabel: 'Autres', limit: 2 });

    expect(bars).toEqual([
      { key: 'a', label: 'Nom a', value: 50 },
      { key: 'b', label: 'Nom b', value: 30 },
      { key: '__others', label: 'Autres', value: 15 },
    ]);
  });

  test('une seule entrée de trop n’est pas repliée seule derrière « Autres »', () => {
    const bars = breakdownBars({ entries: entries.slice(0, 3), labelOf, othersLabel: 'Autres', limit: 2 });

    expect(bars.map((bar) => bar.key)).toEqual(['a', 'b', 'c']);
  });

  test('aucune entrée, aucune barre', () => {
    expect(breakdownBars({ entries: [], labelOf, othersLabel: 'Autres', limit: 8 })).toEqual([]);
  });
});
