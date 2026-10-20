import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { loadGameCatalog } from '../i18n-game-catalog';
import { loadOnboardingCatalog } from '../i18n-onboarding-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '../inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '../interface-language';

/**
 * **LE JEU RACONTE, IL NE COMPTE PLUS** (épopée § 3.1 et § 4, #11173) — la garde
 * de vocabulaire du web. Le lexique vit, une langue par fichier, dans
 * `packages/shared/design/game-epic-vocabulary/<langue>.json` (format :
 * `docs/product/epopee/glossaire/README.md`) ; la garde iOS lira les MÊMES
 * fichiers. Une langue entre sous la garde en posant son fichier : rien à
 * déclarer ici.
 *
 * Pour chaque langue : aucune valeur des catalogues du jeu (le catalogue `game.*`
 * entier, la pastille d'engagement, l'accueil qui fait jaillir les premières
 * étincelles) ne porte un motif banni, paramètres `{…}` mis de côté ; et chaque
 * clé de NOM (palier, rang, contenant, forme de Flamme, joute, concept) porte le
 * nom canonique, au caractère près.
 */

const SHARED_VOCABULARY = join(dirname(fileURLToPath(import.meta.url)), '../../../../../packages/shared/design/game-epic-vocabulary');

const keyScope = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const vocabularySchema = z.object({
  $doc: z.string().optional(),
  language: z.enum(SUPPORTED_INTERFACE_LANGUAGES),
  banned: z.array(
    z.object({
      pattern: z.string().min(1),
      flags: z.string().regex(/^[imsu]*$/),
      instead: z.string().min(1),
      keys: keyScope.optional(),
      except: z.array(z.string().min(1)).optional(),
    }),
  ),
  names: z.record(z.string().regex(/^game\./), z.string().min(1)),
});

type Vocabulary = z.infer<typeof vocabularySchema>;
type BannedRule = Vocabulary['banned'][number];
type Catalog = Readonly<Record<string, string>>;
type Violation = { readonly key: string; readonly value: string; readonly pattern: string; readonly instead: string };

const asList = (scope: string | readonly string[]): readonly string[] => (typeof scope === 'string' ? [scope] : scope);

const ruleGoverns = (rule: BannedRule, key: string): boolean =>
  (rule.keys === undefined || asList(rule.keys).some((prefix) => key.startsWith(prefix))) &&
  !(rule.except ?? []).some((prefix) => key.startsWith(prefix));

const withoutPlaceholders = (value: string): string => value.replace(/\{[^{}]*\}/g, ' ');

/** Les mots bannis que porte un catalogue : une ligne par (clé, motif) fautif. */
const bannedWordsIn = (vocabulary: Vocabulary, catalog: Catalog): readonly Violation[] =>
  vocabulary.banned.flatMap((rule) => {
    const matcher = new RegExp(rule.pattern, rule.flags);
    return Object.entries(catalog)
      .filter(([key, value]) => ruleGoverns(rule, key) && matcher.test(withoutPlaceholders(value)))
      .map(([key, value]) => ({ key, value, pattern: rule.pattern, instead: rule.instead }));
  });

/** Les clés de nom qui ne portent pas leur nom canonique (ou qui n'existent plus). */
const misnamedIn = (vocabulary: Vocabulary, catalog: Catalog) =>
  Object.entries(vocabulary.names)
    .filter(([key, name]) => catalog[key] !== name)
    .map(([key, name]) => ({ key, expected: name, actual: catalog[key] ?? null }));

const vocabularies: readonly Vocabulary[] = readdirSync(SHARED_VOCABULARY)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => vocabularySchema.parse(JSON.parse(readFileSync(join(SHARED_VOCABULARY, file), 'utf8'))));

const engagementCatalog = async (language: InterfaceLanguage): Promise<Catalog> =>
  (await import(`../interface-catalogs/catalog-${language}-engagement.ts`)).default as Catalog;

/** Les catalogues du jeu d'une langue, fusionnés : `game.*`, la pastille d'engagement, l'accueil. */
const gameCatalogsOf = async (language: InterfaceLanguage): Promise<Catalog> => ({
  ...(await loadGameCatalog(language)),
  ...(await engagementCatalog(language)),
  ...(await loadOnboardingCatalog(language)),
});

describe('le lexique partagé de l’épopée', () => {
  test('le français, la source, est posé, et une langue n’a qu’un fichier', () => {
    const languages = vocabularies.map((vocabulary) => vocabulary.language);
    expect(languages).toContain('fr');
    expect(new Set(languages).size).toBe(languages.length);
  });

  test('chaque fichier porte le nom de sa langue', () => {
    const files = readdirSync(SHARED_VOCABULARY).filter((file) => file.endsWith('.json')).sort();
    expect(files).toEqual(vocabularies.map((vocabulary) => `${vocabulary.language}.json`).sort());
  });

  test('chaque motif banni se compile et dit ce qui le remplace', () => {
    for (const vocabulary of vocabularies) {
      for (const rule of vocabulary.banned) {
        expect(() => new RegExp(rule.pattern, rule.flags)).not.toThrow();
      }
    }
  });

  test('la garde voit un mot banni, et ne le voit pas dans un paramètre', () => {
    const french = vocabularies.find((vocabulary) => vocabulary.language === 'fr');
    if (french === undefined) throw new Error('le lexique français manque');
    const caught = bannedWordsIn(french, {
      'game.sparks.trap': 'Ta dette : {debt}',
      'game.flame.trap': 'Ta plus longue Flamme : {record}',
    });
    expect(caught.map((violation) => violation.key)).toEqual(['game.sparks.trap']);
  });
});

describe('aucune valeur du jeu ne porte un mot banni, dans aucune langue posée', () => {
  for (const vocabulary of vocabularies) {
    test(`${vocabulary.language} : aucun mot banni`, async () => {
      expect({ language: vocabulary.language, violations: bannedWordsIn(vocabulary, await gameCatalogsOf(vocabulary.language)) }).toEqual({
        language: vocabulary.language,
        violations: [],
      });
    });

    test(`${vocabulary.language} : chaque clé de nom porte son nom canonique`, async () => {
      expect({ language: vocabulary.language, misnamed: misnamedIn(vocabulary, await gameCatalogsOf(vocabulary.language)) }).toEqual({
        language: vocabulary.language,
        misnamed: [],
      });
    });
  }
});
