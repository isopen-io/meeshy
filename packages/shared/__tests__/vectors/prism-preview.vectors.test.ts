/**
 * Suite de vecteurs pour `resolveLastMessagePreview` — la résolution du Prisme
 * Linguistique sur l'aperçu de dernier message d'une ligne de liste.
 *
 * `prism-preview.vectors.json` est le CONTRAT cross-plateforme des TROIS miroirs
 * que CLAUDE.md nomme source de vérité de cette règle :
 *  - `resolveLastMessagePreview` (`packages/shared/utils/conversation-helpers.ts`) — rejoué ici ;
 *  - `MeeshyConversation.resolvedLastMessagePreview` (`packages/MeeshySDK/.../Models/CoreModels.swift`) ;
 *  - `resolveLastMessagePreview` (`apps/android/core/model/.../lang/LastMessagePreviewResolver.kt`).
 *
 * Les trois clients rendent la MÊME ligne depuis le MÊME payload REST
 * (`GET /conversations` livre `lastMessageTranslations` + `lastMessageOriginalLanguage`
 * à côté de l'aperçu brut). Jusqu'ici chacun portait sa propre suite écrite À LA
 * MAIN, et chacune se déclarait « one-for-one mirror » des deux autres dans son
 * en-tête (`LastMessagePreviewResolverTest.kt` L7, `ConversationPrismeResolutionTests.swift`) —
 * une parité affirmée en PROSE, gardée par rien. C'est exactement le trou « N
 * miroirs, zéro témoin de parité » que les leçons 291/292 désignent comme le plus
 * dangereux : c'est sous cette absence de témoin qu'un miroir dérive sans bruit
 * (cf. `ApiConversation` Android, qui jetait `lastMessageTranslations` — cycle 118).
 *
 * Ce fichier est le premier des trois rejeux du contrat machine qui remplace la
 * prose. Le rejeu Android (`PrismPreviewVectorParityTest.kt`) et iOS
 * (`PrismPreviewVectorTests.swift`) chargent le MÊME JSON.
 *
 * `resolveLastMessagePreview` rend le TEXTE servi (ou l'aperçu original quand
 * aucune langue du lecteur n'est servie) — jamais `null`, SAUF quand l'aperçu
 * original lui-même est `null`. C'est la forme commune aux trois plateformes ;
 * `resolvePrismTranslation` (qui rend `{language, text} | null`) reste testée
 * séparément par `resolve-prism-translation.test.ts`, car sa PAIRE
 * (langue + texte) n'a de consommateur que côté serveur.
 *
 * @see packages/shared/utils/conversation-helpers.ts
 * @see packages/shared/fixtures/reading-modes/prism-preview.vectors.json
 */

import { runVectors } from './harness.js';
import { resolveLastMessagePreview } from '../../utils/conversation-helpers.js';

type PrismPreviewInput = {
  readonly preview: string | null;
  readonly translations: Readonly<Record<string, string>> | null;
  readonly originalLanguage: string | null;
  readonly preferredLanguages: readonly string[];
};

type PrismPreviewExpected = string | null;

function adaptPrismPreview(input: PrismPreviewInput): PrismPreviewExpected {
  return (
    resolveLastMessagePreview({
      preview: input.preview,
      translations: input.translations,
      originalLanguage: input.originalLanguage,
      preferredLanguages: input.preferredLanguages,
    }) ?? null
  );
}

runVectors<PrismPreviewInput, PrismPreviewExpected>('prism-preview', adaptPrismPreview);
