/**
 * Rejeu du golden partagé du Prisme (issue #3677) sur la famille
 * POSTS/COMMENTAIRES, second site : `resolveAutoTranslation`
 * (`apps/web/components/v2/TranslationToggle.tsx`), le cœur pur extrait de
 * `autoResolved` pour être golden-testé indépendamment du composant.
 *
 * Le PREMIER site de cette famille (`usePostTranslation.findTranslation`)
 * délègue déjà à `resolvePrismTranslation` depuis avant cette issue — rejoué
 * par `use-post-translation.prism-vectors.test.ts`. Ce fichier ferme la
 * seconde moitié : `TranslationToggle.autoResolved` réimplémentait la même
 * descente à la main.
 *
 * @see packages/shared/fixtures/reading-modes/prism-translation.vectors.json
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAutoTranslation, type TranslationItem } from '@/components/v2/TranslationToggle';

type Vector = {
  readonly _label?: string;
  readonly input: {
    readonly translations: Readonly<Record<string, string>> | null;
    readonly originalLanguage: string | null;
    readonly preferredLanguages: readonly string[];
  };
  readonly expected: { readonly language: string; readonly text: string } | null;
};

const FIXTURE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'shared',
  'fixtures',
  'reading-modes',
  'prism-translation.vectors.json',
);

function loadVectors(): readonly Vector[] {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as { vectors: Vector[] };
  if (!Array.isArray(parsed.vectors) || parsed.vectors.length === 0) {
    throw new Error(`prism-translation.vectors.json: attendu un tableau non vide sous "vectors"`);
  }
  return parsed.vectors;
}

function adaptTranslations(translations: Readonly<Record<string, string>> | null): readonly TranslationItem[] {
  if (!translations) return [];
  return Object.entries(translations).map(
    ([languageCode, content]): TranslationItem => ({
      languageCode,
      languageName: languageCode,
      content,
    }),
  );
}

describe('vectors: prism-translation (famille posts/commentaires — TranslationToggle)', () => {
  const vectors = loadVectors();

  vectors.forEach((vector, index) => {
    const name = vector._label ? `case ${index} — ${vector._label}` : `case ${index}`;

    it(name, () => {
      const originalLanguage = vector.input.originalLanguage ?? '';
      const match = resolveAutoTranslation(
        vector.input.preferredLanguages,
        originalLanguage,
        adaptTranslations(vector.input.translations),
      );

      if (vector.expected === null) {
        expect(match).toBeNull();
      } else {
        expect(match?.languageCode).toBe(vector.expected.language);
        expect(match?.content).toBe(vector.expected.text);
      }
    });
  });
});
