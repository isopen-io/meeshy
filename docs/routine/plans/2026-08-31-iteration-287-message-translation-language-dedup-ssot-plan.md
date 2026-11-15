# Plan — Itération 287 : `MessageTranslationService` sur la SSOT `normalizeLanguageForDedup`

## Objectifs
Rallier le résolveur d'audience/canonicalisation de langue de
`MessageTranslationService` à la SSOT `normalizeLanguageForDedup`, jumeau de
l'itération 286 (`PostService.audienceLanguages`). Fermer la divergence de
stripping de région hors catalogue (`'fil-PH'` → `'fil'`) sur les six sites inline.

## Modules affectés
- `services/gateway/src/services/message-translation/MessageTranslationService.ts`
  (production, 6 sites + import + doc-comments)
- `services/gateway/src/__tests__/unit/services/message-translation-destinations.test.ts`
  (+1 pin)
- `services/gateway/src/__tests__/unit/services/message-translation-source-language.test.ts`
  (+2 pins)

## Phases
1. **RED** — pins de dédup anonyme (`fil-PH`/`fil` → `['fil']`), source
   `fil-PH → fil`, filtre `fil` contre source `fil-PH`. ✅ prouvés rouges.
2. **GREEN** — import `normalizeLanguageForDedup`, remplacement des 6 inline,
   alignement des doc-comments. ✅
3. **Budget** — le fichier étant déjà hors budget, ramener sous le plafond frozen
   (3303) en resserrant les commentaires ajoutés. ✅ 3303.
4. **Validation** — suites `MessageTranslationService*`, `tsc`, budget. ✅

## Dépendances
Aucune (fonction pure de shared déjà buildée).

## Risques estimés
Faible. Aucune régression sur codes du catalogue (idempotence mesurée). Lecture
legacy protégée par le lookup verbatim-d'abord.

## Stratégie de rollback
Revert du commit unique ; changement isolé à un service.

## Critères de validation
- 3 nouveaux pins RED→GREEN ; 197 tests `MessageTranslationService*` verts.
- `tsc --noEmit` : 0 erreur. Cliquet de budget vert.

## Statut
LIVRÉ. Boucle envoi/stockage/lecture canonicalisée par une seule SSOT.

## Améliorations futures
- Balayer les autres consommateurs TS qui inlinent encore
  `normalizeLanguageCode(x) ?? x.toLowerCase()` là où la sémantique est un
  DÉDUP/agrégat (candidats repérés : `offlineParticipantQueue.ts`,
  `message-payload-filter.ts`, `ZmqRequestSender.ts`) — vérifier au cas par cas
  si l'usage est dédup (→ SSOT) ou canonicalisation d'un code unique (→ inline OK).
