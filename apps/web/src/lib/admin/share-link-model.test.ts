import { describe, expect, test } from 'bun:test';

import { decodeAdminShareLink, decodeAdminShareLinkRow, type AdminShareLink } from '@/lib/api/admin-share-links';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { servedShareLink, servedShareLinkFiche } from './share-link-fixtures';
import {
  shareLinkGestures,
  shareLinkGuestPermissions,
  shareLinkRequirements,
  shareLinkRestrictions,
  shareLinkState,
  shareLinkUsage,
} from './share-link-model';

/**
 * **CE QU'UN LIEN DE PARTAGE PERMET, EXIGE ET RESTREINT, DIT EN MOTS** (#8876,
 * #6729).
 */

setupAdminKitTests({ languages: ['fr', 'en'] });

const NOW = new Date('2026-09-30T12:00:00.000Z');

const fiche = (overrides: Readonly<Record<string, unknown>> = {}): AdminShareLink => {
  const decoded = decodeAdminShareLink(servedShareLinkFiche(overrides));
  if (decoded === null) throw new Error('fixture illisible');
  return decoded;
};

describe('shareLinkUsage — « 12 sur 50 » ou « 12, sans limite »', () => {
  test('avec un plafond', () => {
    expect(shareLinkUsage(12, 50, 'fr')).toBe('12 sur 50');
    expect(shareLinkUsage(12, 50, 'en')).toBe('12 of 50');
  });

  test('sans plafond (null ou zéro) : sans limite', () => {
    expect(shareLinkUsage(12, null, 'fr')).toBe('12, sans limite');
    expect(shareLinkUsage(12, 0, 'fr')).toBe('12, sans limite');
  });

  test('les grands nombres sont formatés', () => {
    expect(shareLinkUsage(1204, 5000, 'fr')).toMatch(/^1\s204 sur 5\s000$/);
  });
});

describe('shareLinkState — fermé > expiré > quota atteint > actif', () => {
  const row = (overrides: Readonly<Record<string, unknown>>) => {
    const decoded = decodeAdminShareLinkRow(servedShareLink(overrides));
    if (decoded === null) throw new Error('fixture illisible');
    return decoded;
  };

  test('actif', () => {
    expect(shareLinkState(row({}), NOW, 'fr').label).toBe('Actif');
  });

  test('fermé à la main l’emporte sur tout le reste', () => {
    expect(shareLinkState(row({ isActive: false, expiresAt: '2026-01-01T00:00:00.000Z' }), NOW, 'fr').label).toBe('Fermé');
  });

  test('expiré', () => {
    expect(shareLinkState(row({ expiresAt: '2026-09-01T00:00:00.000Z' }), NOW, 'fr').label).toBe('Expiré');
  });

  test('quota atteint', () => {
    expect(shareLinkState(row({ maxUses: 12, currentUses: 12 }), NOW, 'fr').label).toBe('Quota atteint');
  });

  test('sans date ni plafond, jamais expiré ni épuisé', () => {
    expect(shareLinkState(row({ expiresAt: null, maxUses: null, currentUses: 9999 }), NOW, 'fr').label).toBe('Actif');
  });
});

describe('les permissions des invités, en PHRASES', () => {
  test('quatre phrases, une par permission, jamais true/false', () => {
    const phrases = shareLinkGuestPermissions(fiche(), 'fr');

    expect(phrases.map((phrase) => phrase.id)).toEqual(['messages', 'files', 'images', 'history']);
    expect(phrases.map((phrase) => phrase.phrase)).toEqual([
      'Les invités peuvent écrire des messages',
      'Les invités ne peuvent pas envoyer de fichiers',
      'Les invités peuvent envoyer des images',
      'Les invités ne voient que ce qui est écrit après leur arrivée',
    ]);
    expect(phrases.map((phrase) => phrase.allowed)).toEqual([true, false, true, false]);
  });

  test('dans la langue d’interface', () => {
    expect(shareLinkGuestPermissions(fiche(), 'en')[0]?.phrase).toBe('Guests can write messages');
  });

  test('une permission que la charge ne porte pas se dit « Non communiqué » — jamais un « non » inventé', () => {
    const phrases = shareLinkGuestPermissions(fiche({ allowViewHistory: undefined }), 'fr');

    expect(phrases[3]).toEqual({ id: 'history', allowed: null, phrase: 'Non communiqué' });
  });
});

describe('les exigences du lien, en PHRASES', () => {
  test('compte, pseudonyme, e-mail, date de naissance', () => {
    const phrases = shareLinkRequirements(fiche(), 'fr');

    expect(phrases.map((phrase) => phrase.phrase)).toEqual([
      'Aucun compte n’est exigé : on peut entrer en invité',
      'Les invités doivent choisir un pseudonyme',
      'Aucune adresse e-mail n’est exigée',
      'Aucune date de naissance n’est exigée',
    ]);
  });

  test('un lien qui exige tout le dit', () => {
    const phrases = shareLinkRequirements(fiche({ requireAccount: true, requireEmail: true, requireBirthday: true }), 'fr');

    expect(phrases.map((phrase) => phrase.allowed)).toEqual([true, true, true, true]);
    expect(phrases[0]?.phrase).toBe('Un compte Meeshy est exigé pour entrer');
  });
});

describe('les restrictions — pays et langues NOMMÉS', () => {
  test('« FR » et « SN » deviennent des noms de pays, « fr » et « wo » des noms de langues, triés', () => {
    const restrictions = shareLinkRestrictions(fiche(), 'fr');

    expect(restrictions.countries).toEqual(['France', 'Sénégal']);
    expect(restrictions.languages).toEqual(['Français', 'Wolof']);
  });

  test('dans la langue d’interface', () => {
    expect(shareLinkRestrictions(fiche(), 'en')).toEqual({ countries: ['France', 'Senegal'], languages: ['French', 'Wolof'] });
  });

  test('aucune restriction : des listes vides, que l’écran dit « Aucune restriction »', () => {
    expect(shareLinkRestrictions(fiche({ allowedCountries: [], allowedLanguages: [] }), 'fr')).toEqual({ countries: [], languages: [] });
  });

  test('un code que personne ne sait nommer ne devient JAMAIS un code à l’écran', () => {
    const restrictions = shareLinkRestrictions(fiche({ allowedCountries: ['QQ'], allowedLanguages: ['xx-unknown'] }), 'fr');

    expect(restrictions.countries).toEqual(['Pays inconnu']);
    expect(restrictions.languages).toEqual(['Langue inconnue']);
  });

  test('deux codes inconnus ne donnent pas deux fois le même mot', () => {
    expect(shareLinkRestrictions(fiche({ allowedCountries: ['XX', 'QQ'] }), 'fr').countries).toEqual(['Pays inconnu']);
  });
});

describe('les gestes offerts', () => {
  test('un lien ouvert se ferme', () => {
    expect(shareLinkGestures({ isActive: true }, { isSovereign: false })).toEqual(['close']);
  });

  test('un lien fermé se rouvre', () => {
    expect(shareLinkGestures({ isActive: false }, { isSovereign: false })).toEqual(['reopen']);
  });

  test('le secret ne se révèle qu’au rang souverain', () => {
    expect(shareLinkGestures({ isActive: true }, { isSovereign: true })).toEqual(['close', 'reveal']);
    expect(shareLinkGestures({ isActive: false }, { isSovereign: true })).toEqual(['reopen', 'reveal']);
    expect(shareLinkGestures({ isActive: true }, { isSovereign: false })).not.toContain('reveal');
  });
});
