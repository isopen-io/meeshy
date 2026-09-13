/**
 * Rejeu du golden partagé du Prisme (issue #3677) sur la famille AUDIO :
 * `resolveAudioPrismLanguage` (`apps/web/hooks/use-audio-translation.ts`),
 * le cœur pur extrait de `resolveAutoLanguage` pour être golden-testé
 * indépendamment du hook React qui l'entoure.
 *
 * `resolveAudioPrismLanguage` délègue à `resolvePrismTranslation`
 * (`@meeshy/shared`) — la même fonction que rejoue
 * `packages/shared/__tests__/vectors/prism-translation.vectors.test.ts`. Ce
 * fichier charge le MÊME fichier JSON et adapte sa forme : une piste par
 * langue de traduction (avec `url`), et la sortie `{language,text}|null`
 * ramenée à `'original' | language` — la forme que le hook rend réellement.
 *
 * @see packages/shared/fixtures/reading-modes/prism-translation.vectors.json
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SocketIOTranslatedAudio } from '@meeshy/shared/types';
import { resolveAudioPrismLanguage } from '@/hooks/use-audio-translation';

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

/**
 * Une piste par langue de traduction, dotée d'une URL (condition de matching
 * du hook). Une entrée au texte vide/blanc du golden n'a pas d'équivalent
 * audio littéral (la disponibilité d'une piste se signale par son URL, pas
 * par un texte transcrit non-vide) — elle se traduit donc par l'ABSENCE de
 * piste pour cette langue, l'équivalent le plus proche de « entrée ignorée ».
 */
function adaptAudios(translations: Readonly<Record<string, string>> | null): readonly SocketIOTranslatedAudio[] {
  if (!translations) return [];
  return Object.entries(translations)
    .filter(([, text]) => typeof text === 'string' && text.trim() !== '')
    .map(
      ([targetLanguage, text]): SocketIOTranslatedAudio => ({
        id: `audio-${targetLanguage}`,
        type: 'audio',
        targetLanguage,
        translatedText: text,
        url: `https://example.com/audio-${targetLanguage}.mp3`,
        durationMs: 1000,
        cloned: false,
        quality: 1,
      }),
    );
}

describe('vectors: prism-translation (famille audio)', () => {
  const vectors = loadVectors();

  vectors.forEach((vector, index) => {
    const name = vector._label ? `case ${index} — ${vector._label}` : `case ${index}`;

    it(name, () => {
      const audios = adaptAudios(vector.input.translations);
      const actual = resolveAudioPrismLanguage(
        audios,
        vector.input.preferredLanguages,
        vector.input.originalLanguage,
      );
      const expected = vector.expected ? vector.expected.language : 'original';
      expect(actual).toBe(expected);
    });
  });
});
