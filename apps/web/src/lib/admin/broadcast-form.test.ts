import { beforeAll, describe, expect, test } from 'bun:test';

import { servedBroadcast } from '@/lib/admin/broadcast-fixtures';
import { decodeAdminBroadcast } from '@/lib/api/admin-broadcasts';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import {
  INACTIVE_DAYS_DEFAULT,
  bodyOfForm,
  countryOptions,
  defaultSourceLanguage,
  formOfBroadcast,
  languageOptions,
  newBroadcastForm,
  targetingOfForm,
  validateBroadcastForm,
  type BroadcastForm,
} from './broadcast-form';

/**
 * **LE FORMULAIRE D'UNE DIFFUSION** (#8876, #6731) — ce que la feuille de
 * composition pose, valide champ par champ, et envoie. La passerelle ne valide que
 * la présence des quatre champs (`!name || !subject || …`) : c'est ICI que chaque
 * erreur se dit sous son champ.
 */
beforeAll(async () => {
  await loadAdminInterfaceCatalog('fr');
  await loadAdminInterfaceCatalog('en');
});

const filled = (overrides: Partial<BroadcastForm> = {}): BroadcastForm => ({
  ...newBroadcastForm('fr'),
  name: 'Lancement',
  subject: 'Nouveautés',
  body: 'Bonjour',
  ...overrides,
});

describe('newBroadcastForm', () => {
  test('part vide, dans la langue donnée, sans filtre d’activité, pour 30 jours d’inactivité', () => {
    expect(newBroadcastForm('es')).toEqual({
      name: '',
      subject: '',
      body: '',
      sourceLanguage: 'es',
      activity: 'all',
      inactiveDays: String(INACTIVE_DAYS_DEFAULT),
      languages: [],
      countries: [],
    });
    expect(INACTIVE_DAYS_DEFAULT).toBe(30);
  });

  test('la langue du message par défaut est celle de l’interface', () => {
    expect(defaultSourceLanguage('fr')).toBe('fr');
    expect(defaultSourceLanguage('ar')).toBe('ar');
  });
});

describe('validateBroadcastForm — champ par champ', () => {
  test('un formulaire complet n’a aucune erreur', () => {
    expect(validateBroadcastForm(filled())).toEqual([]);
  });

  test('le nom, l’objet et le message sont requis — des espaces ne comptent pas', () => {
    expect(validateBroadcastForm(filled({ name: '   ' }))).toEqual(['name']);
    expect(validateBroadcastForm(filled({ subject: '' }))).toEqual(['subject']);
    expect(validateBroadcastForm(filled({ body: '\n  \n' }))).toEqual(['body']);
  });

  test('toutes les erreurs sont rendues à la fois, dans l’ordre du formulaire', () => {
    expect(validateBroadcastForm(filled({ name: '', subject: '', body: '', sourceLanguage: '' }))).toEqual(['name', 'subject', 'body', 'sourceLanguage']);
  });

  test('la durée d’inactivité n’est contrôlée que pour des comptes inactifs', () => {
    expect(validateBroadcastForm(filled({ activity: 'active', inactiveDays: 'abc' }))).toEqual([]);
    expect(validateBroadcastForm(filled({ activity: 'inactive', inactiveDays: 'abc' }))).toEqual(['inactiveDays']);
  });

  test('un nombre entier de jours entre 1 et 3 650', () => {
    const invalid = (inactiveDays: string) => validateBroadcastForm(filled({ activity: 'inactive', inactiveDays }));

    expect(invalid('1')).toEqual([]);
    expect(invalid('3650')).toEqual([]);
    expect(invalid('0')).toEqual(['inactiveDays']);
    expect(invalid('3651')).toEqual(['inactiveDays']);
    expect(invalid('2.5')).toEqual(['inactiveDays']);
    expect(invalid('-4')).toEqual(['inactiveDays']);
    expect(invalid('')).toEqual(['inactiveDays']);
  });
});

describe('bodyOfForm — le corps exact envoyé à la passerelle', () => {
  test('sans filtre : seule l’activité « tous » est posée', () => {
    expect(bodyOfForm(filled())).toEqual({
      name: 'Lancement',
      subject: 'Nouveautés',
      body: 'Bonjour',
      sourceLanguage: 'fr',
      targeting: { activityStatus: 'all' },
    });
  });

  test('les champs sont nettoyés aux bords, le corps garde ses retours à la ligne', () => {
    const body = bodyOfForm(filled({ name: '  Lancement ', subject: ' Nouveautés  ', body: '  Bonjour,\n\nÀ vite.  ' }));

    expect(body.name).toBe('Lancement');
    expect(body.subject).toBe('Nouveautés');
    expect(body.body).toBe('Bonjour,\n\nÀ vite.');
  });

  test('des comptes inactifs portent leur durée ; les autres activités non', () => {
    expect(bodyOfForm(filled({ activity: 'inactive', inactiveDays: '45' })).targeting).toEqual({ activityStatus: 'inactive', inactiveDays: 45 });
    expect(bodyOfForm(filled({ activity: 'active', inactiveDays: '45' })).targeting).toEqual({ activityStatus: 'active' });
  });

  test('les langues et les pays ne sont posés que s’il y en a', () => {
    expect(bodyOfForm(filled({ languages: ['fr', 'es'], countries: ['SN'] })).targeting).toEqual({
      activityStatus: 'all',
      languages: ['fr', 'es'],
      countries: ['SN'],
    });
  });
});

describe('targetingOfForm — pour dire l’audience pendant la saisie', () => {
  test('une durée illisible retombe sur les 30 jours par défaut, jamais NaN', () => {
    expect(targetingOfForm(filled({ activity: 'inactive', inactiveDays: 'abc' })).inactiveDays).toBe(30);
  });

  test('une durée n’existe que pour des comptes inactifs', () => {
    expect(targetingOfForm(filled({ activity: 'active', inactiveDays: '12' })).inactiveDays).toBeNull();
    expect(targetingOfForm(filled({ activity: 'inactive', inactiveDays: '12' })).inactiveDays).toBe(12);
  });
});

describe('formOfBroadcast — l’édition d’un brouillon part de ce qui est enregistré', () => {
  test('reprend le contenu et le ciblage', () => {
    const broadcast = decodeAdminBroadcast(servedBroadcast({ targeting: { activityStatus: 'inactive', inactiveDays: 60, languages: ['es'], countries: ['SN', 'FR'] } }));

    expect(broadcast).not.toBeNull();
    expect(formOfBroadcast(broadcast!)).toEqual({
      name: 'Lancement de l’automne',
      subject: 'Nouveautés de septembre',
      body: 'Bonjour,\nvoici ce qui change ce mois-ci.',
      sourceLanguage: 'fr',
      activity: 'inactive',
      inactiveDays: '60',
      languages: ['es'],
      countries: ['SN', 'FR'],
    });
  });

  test('enregistrer sans rien changer renvoie le même ciblage', () => {
    const broadcast = decodeAdminBroadcast(servedBroadcast({ targeting: { activityStatus: 'new', languages: ['fr'], countries: [] } }));
    const body = bodyOfForm(formOfBroadcast(broadcast!));

    expect(body.targeting).toEqual({ activityStatus: 'new', languages: ['fr'] });
  });
});

describe('les listes de choix — nommées, jamais des codes', () => {
  test('les langues : celles que la traduction sait servir, nommées dans la langue d’interface, triées', () => {
    const options = languageOptions('fr');

    expect(options.find((option) => option.value === 'es')?.label).toBe('Espagnol');
    expect(options.find((option) => option.value === 'fr')?.label).toBe('Français');
    expect(options.length).toBeGreaterThan(40);
    const labels = options.map((option) => option.label);
    expect([...labels].sort((a, b) => a.localeCompare(b, 'fr'))).toEqual(labels);
    expect(options.every((option) => option.label !== option.value)).toBe(true);
  });

  test('une langue déjà enregistrée mais hors liste reste choisissable, et nommée', () => {
    const options = languageOptions('fr', ['xx-test']);

    expect(options.some((option) => option.value === 'xx-test')).toBe(true);
    expect(options.find((option) => option.value === 'xx-test')?.label).not.toBe('xx-test');
  });

  test('les pays : ceux que garde la liste de l’application, nommés, triés', () => {
    const options = countryOptions('fr');

    expect(options.find((option) => option.value === 'SN')?.label).toBe('Sénégal');
    expect(options.find((option) => option.value === 'FR')?.label).toBe('France');
    expect(options.length).toBeGreaterThan(200);
    const labels = options.map((option) => option.label);
    expect([...labels].sort((a, b) => a.localeCompare(b, 'fr'))).toEqual(labels);
  });

  test('aucun pays de la liste ne se dit « Pays inconnu » : chacun a un vrai nom', () => {
    const unnamed = countryOptions('fr').filter((option) => option.label === 'Pays inconnu' || option.label === option.value);

    expect(unnamed).toEqual([]);
  });

  test('la liste des langues se nomme aussi dans une autre langue d’interface', () => {
    const options = languageOptions('en');

    expect(options.find((option) => option.value === 'fr')?.label).toBe('French');
    expect(options.find((option) => option.value === 'es')?.label).toBe('Spanish');
  });
});
