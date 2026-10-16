import { describe, expect, test } from 'bun:test';

import { catalogPlaceholders } from './i18n-catalog';
import { loadMoodComposeCatalog, moodComposeText, type MoodComposeCatalog } from './i18n-mood-compose-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LES TEXTES DE LA CRÉATION D'UNE HUMEUR (#10527) — la porte vers les autres
 * emojis et la question « sans un petit mot ? », traduits dans les sept
 * langues et chargés avec l'écran, jamais dans l'entrée.
 */
const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, MoodComposeCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadMoodComposeCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('le catalogue de la création d’une humeur', () => {
  test('les sept langues portent exactement les clés du français', async () => {
    const french = sorted(Object.keys(await loadMoodComposeCatalog('fr')));
    expect(french).toEqual(
      sorted([
        'status.compose.more',
        'status.compose.bare.ask',
        'status.compose.bare.add',
        'status.compose.bare.publish',
        /* LA PAGE D'UNE HUMEUR REÇUE (#10813) — chargées avec `/mood/$post`. */
        'mood.page.label',
        'mood.page.close',
        'mood.page.reply.placeholder',
        'mood.page.reply.send',
        'mood.page.reply.sent',
        'mood.page.reply.open',
        'mood.page.reply.failed',
        'mood.page.reply.offline',
        'mood.page.gone',
        'mood.page.loading',
      ]),
    );
    const all = await loadAll();
    expect(all.length).toBe(7);
    for (const [language, catalog] of all) expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: french });
  });

  test('chaque valeur est un texte sans paramètre, jamais vide, traduit hors du français', async () => {
    const french = await loadMoodComposeCatalog('fr');
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        expect({ language, key, params: catalogPlaceholders(value) }).toEqual({ language, key, params: [] });
        if (language !== 'fr') expect({ language, key, copied: value === french[key as keyof MoodComposeCatalog] }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('le vocabulaire est celui de l’humeur — « mood » en anglais', async () => {
    await loadAll();
    expect(moodComposeText('fr', 'status.compose.bare.ask')).toBe('Publier votre humeur sans un petit mot ?');
    expect(moodComposeText('en', 'status.compose.bare.ask')).toBe('Publish your mood without a few words?');
    expect(moodComposeText('fr', 'status.compose.bare.publish')).toBe('Publier quand même');
    expect(moodComposeText('fr', 'status.compose.more')).toBe('Autres emojis');
  });
});
