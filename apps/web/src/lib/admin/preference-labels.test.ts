import { beforeAll, describe, expect, test } from 'bun:test';

import { APPLICATION_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences/application';
import { AUDIO_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences/audio';
import { DOCUMENT_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences/document';
import { MESSAGE_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences/message';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences/notification';
import { PRIVACY_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences/privacy';
import { VIDEO_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences/video';

import type { AdminPreferenceCategory } from '@/lib/api/admin-user-member';
import { loadAdminInterfaceCatalog, translateAdminMaybe } from '@/lib/i18n-admin-catalog';

import {
  PREFERENCE_CHOICES,
  PREFERENCE_KINDS,
  choiceLabel,
  humanizeKey,
  interpretPreferenceValue,
  preferenceKindOf,
  preferenceLabel,
  preferenceLabelKey,
  preferenceOptions,
} from './preference-labels';

/**
 * **LES PRÉFÉRENCES D'UN MEMBRE, ÉTIQUETÉES** (#7920). Le témoin qui ferme la
 * classe : CHAQUE clé des sept `*_PREFERENCE_DEFAULTS` de la passerelle a un
 * libellé traduit (les sept langues : même ensemble de clés par construction des
 * fragments), un genre de valeur dans la table, et se dit en mots — jamais la clé
 * en `camelCase`, jamais `true`, jamais une énumération brute.
 */
const DEFAULTS: Readonly<Record<AdminPreferenceCategory, Readonly<Record<string, unknown>>>> = {
  privacy: PRIVACY_PREFERENCE_DEFAULTS,
  audio: AUDIO_PREFERENCE_DEFAULTS,
  message: MESSAGE_PREFERENCE_DEFAULTS,
  notification: NOTIFICATION_PREFERENCE_DEFAULTS,
  video: VIDEO_PREFERENCE_DEFAULTS,
  document: DOCUMENT_PREFERENCE_DEFAULTS,
  application: APPLICATION_PREFERENCE_DEFAULTS,
};

const CATEGORIES = Object.keys(DEFAULTS) as AdminPreferenceCategory[];

beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
});

const plain = (text: string) => text.replace(/[  ]/g, ' ');

describe('chaque clé des *_PREFERENCE_DEFAULTS est étiquetée', () => {
  for (const category of CATEGORIES) {
    test(`${category} : un libellé français et anglais, un genre de valeur, jamais la clé brute`, () => {
      const keys = Object.keys(DEFAULTS[category]);
      expect(keys.length).toBeGreaterThan(10);
      const unlabeled = keys.filter((key) => translateAdminMaybe('fr', preferenceLabelKey(category, key)) === null);
      const unlabeledEnglish = keys.filter((key) => translateAdminMaybe('en', preferenceLabelKey(category, key)) === null);
      const unkinded = keys.filter((key) => preferenceKindOf(category, key) === null);
      expect(unlabeled).toEqual([]);
      expect(unlabeledEnglish).toEqual([]);
      expect(unkinded).toEqual([]);
      for (const key of keys) expect(preferenceLabel(category, key, 'fr')).not.toBe(key);
    });
  }

  test('la table ne connaît pas de clé que les schémas ignorent, hors les clés facultatives sans défaut', () => {
    const optional: Readonly<Record<AdminPreferenceCategory, readonly string[]>> = {
      privacy: ['allowCallsFromNonContacts'],
      audio: ['ttsVoice'],
      message: [],
      notification: [],
      video: ['videoBitrate', 'defaultCamera', 'virtualBackgroundUrl'],
      document: ['downloadPath'],
      application: [],
    };
    for (const category of CATEGORIES) {
      const known = new Set([...Object.keys(DEFAULTS[category]), ...optional[category]]);
      expect(Object.keys(PREFERENCE_KINDS[category]).filter((key) => !known.has(key))).toEqual([]);
    }
  });

  test('toutes les valeurs par défaut se disent sans échouer, dans les deux langues', () => {
    for (const language of ['fr', 'en'] as const) {
      for (const category of CATEGORIES) {
        for (const [key, value] of Object.entries(DEFAULTS[category])) {
          const said = interpretPreferenceValue(category, key, value as never, language);
          expect(said).not.toBe('');
          expect(said).not.toBe('true');
          expect(said).not.toBe('false');
        }
      }
    }
  });
});

describe('interpretPreferenceValue — la valeur dite en mots', () => {
  test('les booléens : Activé / Désactivé, jamais true / false', () => {
    expect(interpretPreferenceValue('privacy', 'showReadReceipts', true, 'fr')).toBe('Activé');
    expect(interpretPreferenceValue('privacy', 'showReadReceipts', false, 'fr')).toBe('Désactivé');
    expect(interpretPreferenceValue('privacy', 'showReadReceipts', true, 'en')).toBe('On');
  });

  test('les énumérations sont NOMMÉES', () => {
    expect(interpretPreferenceValue('privacy', 'encryptionPreference', 'optional', 'fr')).toBe('Facultatif');
    expect(interpretPreferenceValue('application', 'theme', 'auto', 'fr')).toBe('Automatique');
    expect(interpretPreferenceValue('video', 'selfViewPosition', 'bottom-right', 'fr')).toBe('En bas à droite');
    expect(interpretPreferenceValue('audio', 'voiceCloningQualityPreset', 'high_quality', 'fr')).toBe('Haute qualité');
  });

  test('la vitesse et la hauteur de synthèse se disent en ×', () => {
    expect(interpretPreferenceValue('audio', 'ttsSpeed', 1.5, 'en')).toBe('×1.5');
    expect(interpretPreferenceValue('audio', 'ttsPitch', 1, 'fr')).toBe('×1');
  });

  test('les durées en jours, les tailles en octets, les taux en pourcentage, les longueurs en caractères', () => {
    expect(plain(interpretPreferenceValue('message', 'draftExpirationDays', 30, 'fr'))).toBe('30 jours');
    expect(plain(interpretPreferenceValue('document', 'autoDownloadMaxSize', 10, 'fr'))).toBe('10 Mo');
    expect(plain(interpretPreferenceValue('document', 'imageCompressionQuality', 85, 'fr'))).toBe('85 %');
    expect(plain(interpretPreferenceValue('message', 'maxCharacterLimit', 5000, 'fr'))).toBe('5 000 caractères');
  });

  test('« ne pas déranger » : les heures, les jours, le décalage', () => {
    expect(plain(interpretPreferenceValue('notification', 'dndStartTime', '22:00', 'fr'))).toBe('22:00');
    expect(interpretPreferenceValue('notification', 'dndDays', [], 'fr')).toBe('Tous les jours');
    expect(interpretPreferenceValue('notification', 'dndDays', ['mon', 'tue'], 'fr')).toBe('lundi et mardi');
    expect(interpretPreferenceValue('notification', 'dndUtcOffsetMinutes', 540, 'fr')).toBe('UTC+09:00');
    expect(interpretPreferenceValue('notification', 'dndUtcOffsetMinutes', -210, 'fr')).toBe('UTC−03:30');
    expect(interpretPreferenceValue('notification', 'dndUtcOffsetMinutes', 0, 'fr')).toBe('UTC+00:00');
  });

  test('les langues sont NOMMÉES, jamais un code', () => {
    expect(interpretPreferenceValue('application', 'interfaceLanguage', 'en', 'fr')).toBe('Anglais');
    expect(interpretPreferenceValue('message', 'autoTranslateLanguages', ['en', 'es'], 'fr')).toBe('anglais et espagnol');
    expect(interpretPreferenceValue('message', 'autoTranslateLanguages', [], 'fr')).toBe('Aucune');
  });

  test('les listes se disent par leur effectif', () => {
    expect(interpretPreferenceValue('document', 'allowedFileTypes', ['image/*', 'application/pdf'], 'fr')).toBe('2 type(s) de fichier autorisé(s)');
    expect(interpretPreferenceValue('application', 'tutorialsCompleted', [], 'fr')).toBe('0 tutoriel(s) terminé(s)');
  });

  test('le débit et la cadence d’images portent leur unité, les formats leur nom', () => {
    expect(plain(interpretPreferenceValue('video', 'videoFrameRate', '30', 'fr'))).toBe('30 images par seconde');
    expect(plain(interpretPreferenceValue('video', 'videoBitrate', 2500, 'fr'))).toBe('2 500 kbit/s');
    expect(interpretPreferenceValue('video', 'videoCodec', 'H264', 'fr')).toBe('H264');
    expect(interpretPreferenceValue('audio', 'translatedAudioFormat', 'mp3', 'fr')).toBe('MP3');
  });

  test('une valeur absente se dit « Non renseigné »', () => {
    expect(interpretPreferenceValue('audio', 'ttsVoice', null, 'fr')).toBe('Non renseigné');
    expect(interpretPreferenceValue('audio', 'ttsVoice', '', 'fr')).toBe('Non renseigné');
  });
});

describe('une clé inconnue de ce client se dit quand même — jamais la clé brute', () => {
  test('le libellé se HUMANISE', () => {
    expect(humanizeKey('showReadReceipts')).toBe('Show read receipts');
    expect(humanizeKey('dnd_end-time')).toBe('Dnd end time');
    expect(preferenceLabel('privacy', 'brandNewSwitch', 'fr')).toBe('Brand new switch');
  });

  test('sa valeur se dit selon son type : booléen en mots, nombre formaté, texte, liste par effectif', () => {
    expect(interpretPreferenceValue('privacy', 'brandNewSwitch', true, 'fr')).toBe('Activé');
    expect(plain(interpretPreferenceValue('privacy', 'brandNewNumber', 12345.678, 'fr'))).toBe('12 345,68');
    expect(interpretPreferenceValue('privacy', 'brandNewText', 'abc', 'fr')).toBe('abc');
    expect(interpretPreferenceValue('privacy', 'brandNewList', ['a', 'b', 'c'], 'fr')).toBe('3 élément(s)');
    expect(interpretPreferenceValue('privacy', 'brandNewObject', { a: 1 }, 'fr')).toBe('Données structurées');
  });

  test('une option d’énumération inconnue se dit, humanisée', () => {
    expect(choiceLabel('theme', 'solarized-dark', 'fr')).toBe('Solarized dark');
  });
});

describe('les options des listes fermées', () => {
  test('chaque option de chaque énumération a un nom français', () => {
    for (const [family, options] of Object.entries(PREFERENCE_CHOICES)) {
      for (const option of options) expect(translateAdminMaybe('fr', `admin.people.prefValue.${family}.${option}`)).not.toBeNull();
    }
  });

  test('`preferenceOptions` rend les options nommées d’une clé à liste fermée, null pour toute autre', () => {
    expect(preferenceOptions('application', 'theme', 'fr')).toEqual([
      { value: 'light', label: 'Clair' },
      { value: 'dark', label: 'Sombre' },
      { value: 'auto', label: 'Automatique' },
    ]);
    expect(preferenceOptions('privacy', 'showReadReceipts', 'fr')).toBeNull();
    expect(preferenceOptions('privacy', 'brandNewSwitch', 'fr')).toBeNull();
  });

  test('les options couvrent au moins chaque valeur par défaut des clés à liste fermée', () => {
    for (const category of CATEGORIES) {
      for (const [key, value] of Object.entries(DEFAULTS[category])) {
        const options = preferenceOptions(category, key, 'fr');
        if (options === null) continue;
        expect(options.map((option) => option.value)).toContain(String(value));
      }
    }
  });
});
