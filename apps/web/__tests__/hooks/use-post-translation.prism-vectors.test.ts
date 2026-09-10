/**
 * Rejeu du golden partagé du Prisme (issue #3677) sur la famille
 * POSTS/COMMENTAIRES, premier site : `findTranslation`
 * (`apps/web/hooks/use-post-translation.ts`), qui délègue déjà à
 * `resolvePrismTranslation` via `buildPostTranslationRecord`.
 *
 * Le SECOND site de cette famille (`TranslationToggle.autoResolved`) est
 * rejoué par `TranslationToggle.prism-vectors.test.tsx`.
 *
 * @see packages/shared/fixtures/reading-modes/prism-translation.vectors.json
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findTranslation } from '@/hooks/use-post-translation';

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

/** `findTranslation` attend le dialecte POST (`Record<lang, { text }>`), pas la carte texte nue. */
function adaptPostTranslations(translations: Readonly<Record<string, string>> | null): unknown {
  if (!translations) return null;
  const record: Record<string, { text: string }> = {};
  for (const [lang, text] of Object.entries(translations)) {
    record[lang] = { text };
  }
  return record;
}

describe('vectors: prism-translation (famille posts/commentaires — usePostTranslation)', () => {
  const vectors = loadVectors();

  vectors.forEach((vector, index) => {
    const name = vector._label ? `case ${index} — ${vector._label}` : `case ${index}`;

    it(name, () => {
      const actual = findTranslation(
        adaptPostTranslations(vector.input.translations),
        vector.input.preferredLanguages,
        vector.input.originalLanguage,
      );
      const expected = vector.expected ? vector.expected.text : null;
      expect(actual).toBe(expected);
    });
  });
});
