# Plan d'implémentation — Itération 287

## Objectifs
Faire converger les deux résolveurs de langue serveur restés sur l'inline
`normalizeLanguageCode(x) ?? x.toLowerCase()` vers la SSOT
`normalizeLanguageForDedup`, pour stripper la région des codes région-taggés
HORS catalogue (`'yue-HK'` → `'yue'`) comme le fait déjà le chemin registered.

## Modules affectés
- `packages/shared/utils/conversation-helpers.ts` — `resolveParticipantLanguage`.
- `services/gateway/src/services/message-translation/MessageTranslationService.ts`
  — branche anonyme de `_extractConversationLanguages` (+ import).
- Tests : `packages/shared/__tests__/utils/resolve-participant-language.test.ts`,
  `services/gateway/src/__tests__/unit/services/message-translation-destinations.test.ts`.

## Phases
1. **RED shared** — 3 cas uncatalogued région-taggé sur `resolveParticipantLanguage`. ✅
2. **GREEN shared** — repli via `normalizeLanguageForDedup` (déjà importé). ✅
3. **RED gateway** — 1 cas parité registered↔anonyme (`yue`). ✅
4. **GREEN gateway** — branche anonyme via `normalizeLanguageForDedup` (import élargi). ✅
5. **Non-régression** — suites shared utils (365), MessageTranslationService +
   PostService.audienceLanguages (285), typechecks gateway + shared. ✅

## Dépendances
Aucune. `normalizeLanguageForDedup` existe et est la SSOT documentée (cycle 286).

## Risques estimés
Faible — resserrement idempotent sur les codes catalogués/canoniques ; seul un
code région-taggé hors catalogue change (dans le bon sens). Un seul consommateur
de production de `resolveParticipantLanguage` (`offlineParticipantQueue.ts`), qui
attend précisément des codes réduits.

## Stratégie de rollback
Revert du commit unique — 2 lignes de production, isolées, sans migration ni
changement de contrat de type.

## Critères de validation
Voir l'analyse §« Critères de validation ». Gates : 30 + 7 tests ciblés verts,
650 tests des suites élargies verts, `tsc` 0 erreur (gateway + shared).

## Statut
LIVRÉ. Reste ouvert (suivi éventuel) : les sites inline `?? code`
(SANS lowercase, pour préserver `originalLanguage` verbatim) NE sont PAS visés —
leur intention est de préserver le code tel quel, pas de le dédupliquer ; les
confondre avec la classe de ce lot serait une erreur (leçon 261 : nommer la
propriété, pas le mot par lequel on l'a trouvée).

## Suivi / améliorations futures
Balayer les résolveurs restants qui construisent un Set/liste de langues à
DÉDUPLIQUER sans passer par `normalizeLanguageForDedup` (candidats à instruire un
par un : `message-payload-filter.ts:73`, `ZmqRequestSender.ts:38` — vérifier
d'abord s'ils alimentent une DÉDUP/liste de cibles, ou un simple repli de
service où le strip serait neutre).
