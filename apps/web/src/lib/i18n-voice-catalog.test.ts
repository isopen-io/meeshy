import { describe, expect, test } from 'bun:test';

import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';
import { loadVoiceCatalog, translateVoice, type VoiceCatalog } from './i18n-voice-catalog';

/**
 * LA VOIX (#16419) — le français est la source des clés `voice.*` ; chaque
 * langue en porte exactement les mêmes, aucune valeur vide ni recopiée du
 * français, et un catalogue lu avant d'être chargé lève.
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, VoiceCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadVoiceCatalog(language)] as const));

describe('le catalogue de la voix', () => {
  test('mêmes clés dans les sept langues', async () => {
    const french = Object.keys(await loadVoiceCatalog('fr')).sort();
    const all = await loadAll();
    expect(all.map(([language]) => language).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
    for (const [language, catalog] of all) {
      expect({ language, keys: Object.keys(catalog).sort() }).toEqual({ language, keys: french });
    }
  });

  test('aucune valeur vide, et chaque langue est traduite', async () => {
    const french = await loadVoiceCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim() === '' || value === key }).toEqual({ language, key, empty: false });
      }
      if (language === 'fr') continue;
      for (const key of ['voice.transcription', 'voice.cloning', 'voice.notice.message', 'voice.notice.action'] as const) {
        expect({ language, key, copied: catalog[key] === french[key] }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('chargé, il se lit', async () => {
    await loadVoiceCatalog('ar');
    expect(translateVoice('ar', 'voice.title')).toBe('الصوت');
  });
});
