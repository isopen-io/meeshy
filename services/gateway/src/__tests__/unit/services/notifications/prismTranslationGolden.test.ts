/**
 * Rejeu du golden partagé du Prisme (issue #3677 — garde de parité du Prisme
 * pour ses quatre familles de résolveurs) sur la famille BANNIÈRE DE
 * NOTIFICATION.
 *
 * `NotificationService.prismTranslation` (privée, `services/notifications/NotificationService.ts`)
 * est une délégation LITTÉRALE à `resolvePrismTranslation` :
 *
 * ```ts
 * private prismTranslation(source, preferredLanguages) {
 *   return resolvePrismTranslation({
 *     translations: source.translations,
 *     originalLanguage: source.originalLanguage,
 *     preferredLanguages,
 *   });
 * }
 * ```
 *
 * `NotificationService.ts` fait 6101 lignes — largement hors du budget dur de
 * 1200 lignes (`CLAUDE.md` § Code Style) — et la règle du dépôt est d'en
 * extraire avant d'y ajouter, jamais l'inverse. Ce fichier golde donc
 * directement `resolvePrismTranslation` plutôt que de réfléchir dans la
 * méthode privée ou d'agrandir le fichier : la parité de `prismTranslation`
 * est garantie par construction (délégation littérale, revue de code), et les
 * trois éventails qui l'appellent (`createMessageNotification`, réponse,
 * mention) sont déjà couverts par `messageNotificationPrism.test.ts` /
 * `replyMentionNotificationPrism.test.ts`.
 *
 * Les TROIS autres familles rejouent le MÊME fichier JSON :
 * `packages/shared/__tests__/vectors/prism-translation.vectors.test.ts`
 * (le résolveur nu), `apps/web/__tests__/hooks/use-audio-translation.prism-vectors.test.ts`
 * (audio), `apps/web/__tests__/hooks/use-post-translation.prism-vectors.test.ts`
 * et `apps/web/__tests__/components/v2/TranslationToggle.prism-vectors.test.tsx`
 * (posts/commentaires).
 *
 * @see packages/shared/fixtures/reading-modes/prism-translation.vectors.json
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';

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
  '..',
  '..',
  'packages',
  'shared',
  'fixtures',
  'reading-modes',
  'prism-translation.vectors.json'
);

function loadVectors(): readonly Vector[] {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as { vectors: Vector[] };
  if (!Array.isArray(parsed.vectors) || parsed.vectors.length === 0) {
    throw new Error('prism-translation.vectors.json: attendu un tableau non vide sous "vectors"');
  }
  return parsed.vectors;
}

describe('vectors: prism-translation (famille bannière de notification)', () => {
  const vectors = loadVectors();

  vectors.forEach((vector, index) => {
    const name = vector._label ? `case ${index} — ${vector._label}` : `case ${index}`;

    it(name, () => {
      const actual = resolvePrismTranslation({
        translations: vector.input.translations,
        originalLanguage: vector.input.originalLanguage,
        preferredLanguages: vector.input.preferredLanguages,
      });
      expect(actual).toEqual(vector.expected);
    });
  });
});
