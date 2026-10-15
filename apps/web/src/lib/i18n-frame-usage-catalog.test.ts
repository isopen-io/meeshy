import { describe, expect, test } from 'bun:test';

import vectors from '@meeshy/shared/design/packs/frame-usage-vectors.json';
import { describeFrameUsage, FRAME_USAGE_LABEL_KEYS, parseFrameUsage } from '@meeshy/shared/types/frame-usage';

import { catalogPlaceholders } from './i18n-catalog';
import { frameUsageText, loadFrameUsageCatalog, type FrameUsageCatalog } from './i18n-frame-usage-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from './inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from './interface-language';

/**
 * LE LIBELLÉ D'USAGE D'UN CADRE (#10146) — « Utilisable : appels vidéo et
 * captures », « Capture photo et vidéo uniquement »… : les clés sont CELLES de
 * la loi partagée (`FRAME_USAGE_LABEL_KEYS`), traduites dans les sept langues,
 * chargées à la demande avec la surface qui montre des cadres — jamais dans
 * l'entrée. Les paramètres de chaque clé sont ceux que `describeFrameUsage`
 * émet (vecteurs croisés `frame-usage-vectors.json`).
 */

const loadAll = async (): Promise<ReadonlyArray<readonly [InterfaceLanguage, FrameUsageCatalog]>> =>
  Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => [language, await loadFrameUsageCatalog(language)] as const));

const sorted = (values: Iterable<string>): readonly string[] => [...values].sort();

describe('le catalogue des libellés d’usage des cadres', () => {
  test('chaque langue porte exactement les clés de la loi partagée', async () => {
    const law = sorted(Object.values(FRAME_USAGE_LABEL_KEYS));
    for (const [language, catalog] of await loadAll()) expect({ language, keys: sorted(Object.keys(catalog)) }).toEqual({ language, keys: law });
  });

  test('chaque clé attend les paramètres que la loi émet, dans chaque langue, traduite hors du français', async () => {
    const french = await loadFrameUsageCatalog('fr');
    const params = new Map(vectors.labels.map((entry) => [entry.key, sorted(Object.keys(entry.params))]));
    for (const [language, catalog] of await loadAll()) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ language, key, params: sorted(catalogPlaceholders(value)) }).toEqual({ language, key, params: params.get(key) ?? [] });
        expect({ language, key, empty: value.trim().length === 0 }).toEqual({ language, key, empty: false });
        if (language !== 'fr') expect({ language, key, copied: value === french[key as keyof FrameUsageCatalog] }).toEqual({ language, key, copied: false });
      }
    }
  });

  test('le texte d’un libellé : la clé traduite, ses paramètres posés (noms remis par l’hôte, sinon la valeur de la loi)', async () => {
    await loadFrameUsageCatalog('fr');
    const usage = (input: unknown) => {
      const parsed = parseFrameUsage(input);
      if (parsed === null) throw new Error('usage illisible');
      return describeFrameUsage(parsed);
    };
    expect(frameUsageText('fr', usage({ kind: 'free', surfaces: ['call', 'photo', 'video'] }))).toBe('Utilisable : appels vidéo et captures');
    expect(frameUsageText('fr', usage({ kind: 'free', surfaces: ['photo', 'video'] }))).toBe('Capture photo et vidéo uniquement');
    expect(frameUsageText('fr', usage({ kind: 'rank', rank: 'ambassadeur', division: 4 }), { rank: 'Ambassadeur' })).toBe('Rang Ambassadeur IV uniquement');
    expect(frameUsageText('fr', usage({ kind: 'prestige' }))).toBe('Prestige uniquement');
  });
});
