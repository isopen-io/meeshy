# Iteration 86 — Plan d'implémentation (2026-07-03)

## Objectifs
Corriger deux défauts de correction indépendants, haute confiance, vérifiables en jest/vitest, sans
chevauchement avec les PR ouvertes (#1385 web-realtime, #1384 iOS-a11y) :
- **86-A** : direction du curseur de `PostCommentService.getReplies` (pagination des réponses).
- **86-B** : `CommonSchemas.language` bloque les codes ISO 639-3 supportés à l'envoi/édition.

## Modules affectés
- `services/gateway/src/services/PostCommentService.ts` (86-A)
- `services/gateway/src/__tests__/unit/services/PostCommentService.test.ts` (86-A tests)
- `packages/shared/utils/validation.ts` (86-B)
- `packages/shared/__tests__/validation.test.ts` (86-B tests)

## Phases
1. **86-A** — `getReplies` : comparateur curseur `lt` → `gt` (deux clauses), commentaire doctrine
   liant le comparateur à l'`orderBy: asc`. ✅
2. **86-A tests** — bloc `getReplies — pagination` : assert `where.OR` en `gt` et pas `lt`, survie du
   filtre `parentId`. ✅
3. **86-B** — `validation.ts` : regex `^[a-z]{2}(-[A-Z]{2})?$` → `^[a-z]{2,3}(-[A-Z]{2})?$` +
   commentaire liant à `normalizeLanguageCode`/`isSupportedLanguage`. ✅
4. **86-B tests** — bloc `CommonSchemas.language` : 639-1, 639-3 ×5, région BCP-47, malformés. ✅
5. **Validation** — vitest shared + jest posts/comments (293 tests) + build shared. ✅

## Dépendances
Aucune inter-fix (packages/fichiers disjoints). Prérequis env : `prisma generate` + `bun install`
(effectués). Rebuild shared (`bun run build`) pour la parité dist utilisée par les autres services.

## Risques estimés
FAIBLE des deux côtés (cf. analyse). 86-A ne change que la direction de parcours ; 86-B ne fait
qu'élargir l'acceptation du regex. Aucune signature publique modifiée.

## Stratégie de rollback
`git revert` du commit unique — deux modifs autonomes, aucune migration, aucun changement de contrat
public.

## Critères de validation
- [x] `vitest validation.test.ts` 28/28
- [x] `jest PostCommentService.test.ts` 18/18
- [x] 5 suites posts/comments = 293 tests, 0 régression
- [x] `bun run build` shared OK

## Statut d'achèvement
**COMPLET.** Les deux fixes livrés, testés, sans régression.

## Suivi de progression / futures améliorations
- Résidus bas-sévérité restants (non traités cette itération, self-healing) :
  - F49 `ConversationStatsService` — `updateOnNewMessage` peut écraser un snapshot `onlineUsers`
    valide avec `[]` sur le chemin REST (`MessagingService.updateStats(() => [])`) ; borné par le TTL.
  - `ConversationMessageStatsService.onMessageDeleted` — n'inverse pas `dailyActivity`/
    `hourlyDistribution`/`languageDistribution` (signature sans `originalLanguage`) ; corrigé par
    `recompute()`. Candidat si une itération veut rendre l'incrémental exact (nécessite d'ajouter
    `originalLanguage` à la signature de suppression).
  - `PostService.unlikePost` — ne retire que `userReactions[0]` ; sûr sous l'invariant
    `MAX_REACTIONS_PER_USER=1` mais latent si des données multi-réactions existent.
- Prochaine priorité suggérée : auditer les autres schémas Zod de `validation.ts` pour d'autres
  incohérences 639-1/639-3 (ex. `customDestinationLanguage` l.183 n'a pas de refine).
