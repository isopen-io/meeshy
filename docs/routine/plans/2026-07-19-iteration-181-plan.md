# Plan d'implémentation — Itération 181

## Objectifs
Aligner `generateDefaultConversationTitle` (`packages/shared/utils/conversation-helpers.ts`)
sur l'ordre de priorité CANONIQUE du nom d'affichage
(`displayName → firstName+lastName → username`), identique à `getUserDisplayName`
(web) et au snapshot gateway `MessagingService`. Supprimer la duplication de la
résolution de nom.

## Modules affectés
- `packages/shared/utils/conversation-helpers.ts` (impl)
- `packages/shared/__tests__/conversation-helpers.test.ts` (tests)

## Phases
1. **RED** — +5 tests sur le cas conflictuel (`username` + `firstName/lastName`
   présents) : nom complet prioritaire sur username (1 & multi membres),
   `displayName` reste au sommet, repli username quand nom complet blanc.
2. **GREEN** — extraire `resolveMemberName` (ordre canonique, blank-aware) ;
   déléguer les 3 branches (1 / 2 / 3+ membres) à ce helper.
3. **REFACTOR** — comment JSDoc du helper + repositionnement du JSDoc de la fonction.

## Dépendances
Aucune (fonction pure, sans dépendance externe modifiée).

## Risques estimés
Très faible. Callers gateway (`core.ts`, `search.ts`) fournissent déjà
`firstName`/`lastName`. Tests de routes gateway mockent la fonction → non impactés.

## Stratégie de rollback
`git revert` du commit — changement isolé à un fichier d'impl + son test.

## Critères de validation
- `conversation-helpers.test.ts` 84/84 ; suite shared 46/1368 ; `bun run build` OK.

## Statut de complétion
✅ Complété. RED→GREEN vérifié (l'ancien ordre renvoyait `jdoe123`, le nouveau
`John Doe`). Suite complète verte, build tsc OK.

## Suivi / Améliorations futures
Voir section Backlog de l'analyse 181 (random suffix 6-char, date-format futur,
avatar user-first dans CallEventsHandler).
