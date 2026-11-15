/**
 * Suite de vecteurs pour `resolvePrismTranslation` — la descente ELLE-MÊME du
 * Prisme Linguistique (issue #3677, « garde de parité du Prisme pour ses
 * quatre familles de résolveurs »).
 *
 * `resolveLastMessagePreview` (aperçu de liste) en est une PROJECTION
 * texte-seul, déjà gardée par `prism-preview.vectors.json` /
 * `prism-preview.vectors.test.ts`. Ce fichier garde le résolveur qui rend la
 * PAIRE `{language, text}` — le contrat dont les trois AUTRES familles ont
 * besoin (audio, posts/commentaires, bannière de notification serveur),
 * puisqu'elles doivent chacune savoir dans quelle langue elles servent, pas
 * seulement quel texte :
 *
 *  - audio : `resolveAudioPrismLanguage` (`apps/web/hooks/use-audio-translation.ts`),
 *    rejoué par `apps/web/__tests__/hooks/use-audio-translation.prism-vectors.test.ts` ;
 *  - posts/commentaires : `usePostTranslation.findTranslation` et
 *    `TranslationToggle.resolveAutoTranslation` (`apps/web`), rejoués par
 *    `apps/web/__tests__/hooks/use-post-translation.prism-vectors.test.ts` et
 *    `apps/web/__tests__/components/v2/TranslationToggle.prism-vectors.test.tsx` ;
 *  - bannière de notification : `NotificationService.prismTranslation`
 *    (`services/gateway`), délégation LITTÉRALE à `resolvePrismTranslation` —
 *    rejouée par
 *    `services/gateway/src/__tests__/unit/services/notifications/prismTranslationGolden.test.ts`.
 *
 * Les quatre suites chargent le MÊME JSON : une divergence entre familles ne
 * peut plus se réintroduire en silence.
 *
 * @see packages/shared/utils/conversation-helpers.ts
 * @see packages/shared/fixtures/reading-modes/prism-translation.vectors.json
 */

import { runVectors } from './harness.js';
import { resolvePrismTranslation } from '../../utils/conversation-helpers.js';

type PrismTranslationInput = {
  readonly translations: Readonly<Record<string, string>> | null;
  readonly originalLanguage: string | null;
  readonly preferredLanguages: readonly string[];
};

type PrismTranslationExpected = { readonly language: string; readonly text: string } | null;

function adaptPrismTranslation(input: PrismTranslationInput): PrismTranslationExpected {
  return resolvePrismTranslation({
    translations: input.translations,
    originalLanguage: input.originalLanguage,
    preferredLanguages: input.preferredLanguages,
  });
}

runVectors<PrismTranslationInput, PrismTranslationExpected>('prism-translation', adaptPrismTranslation);
