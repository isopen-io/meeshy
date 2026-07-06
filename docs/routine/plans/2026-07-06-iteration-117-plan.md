# Iteration 117 — Plan d'implémentation (2026-07-06)

## Objectifs
Éliminer la réimplémentation locale du résolveur de nom dans `apps/web/utils/participant-helpers.ts`
(F85) en la déléguant au SSOT `getUserDisplayName`, corrigeant l'affichage de noms blancs/non-trimmés
et l'incohérence nom↔initiales dans les vues de participants.

## Modules affectés
- `apps/web/utils/participant-helpers.ts` (production — délégation).
- `apps/web/utils/__tests__/participant-helpers.test.ts` (nouveau — tests).

## Phases d'implémentation
1. **RED/verify** — Confirmer la divergence (input `{displayName:'   ', username:'bob'}` → ancien `'   '`,
   canonique `'bob'`) et l'usage côte-à-côte nom/initiales dans les deux composants. ✅ Fait.
2. **GREEN** — Importer `getUserDisplayName` depuis `@/utils/user-display-name` ; remplacer le corps de
   `getParticipantDisplayName` par `return getUserDisplayName(user, user.username);`. ✅ Fait.
3. **Tests** — Ajouter `participant-helpers.test.ts` (7 cas : préférence displayName, trim, fallback
   blanc, firstName+lastName, firstName seul, username, cohérence nom↔initiales). ✅ Fait.
4. **Validation** — jest ciblé + suite utils complète + tsc. ✅ Fait.

## Dépendances
- `packages/shared/dist` buildé (pour les imports de types) — présent.
- Client Prisma généré (non requis pour cette cible web, mais généré dans l'environnement).

## Risques estimés
Très faible. Délégation vers un résolveur en production et testé ; aucun changement d'API ni de forme
de retour. Fallback final `user.username` préservé via le 2e argument.

## Stratégie de rollback
`git revert` du commit unique ; 2 fichiers, aucune migration ni changement de schéma/contrat.

## Critères de validation
- [x] `participant-helpers.test.ts` : 7/7 vert.
- [x] `apps/web/utils/__tests__/` : 118/118 vert (aucune régression).
- [x] `tsc --noEmit` : aucune nouvelle erreur dans les fichiers touchés (erreurs préexistantes
      dans `lazy-components`, `link-parser`, `z-index-validator`, `push-token`, `connection.service`
      — indépendantes de ce changement).

## Statut de complétion
**COMPLÉTÉ.** Prêt à commit/push/merge.

## Progress tracking
- F85 : DONE.

## Améliorations futures (backlog)
- **Convergence `contacts-utils.formatLastSeen`** vers `presence-format.formatPresenceLabel` (contrat
  last-seen partagé iOS) — confirmer d'abord la reachability des callers ; touche potentiellement 3
  fichiers (contacts-utils, users.service.formatLastSeenLabel, contacts/page.tsx local copy).
- **`translation-cleaner.deepCleanTranslationOutput`** : soit supprimer (code mort), soit corriger la
  regex apostrophe et la regex ponctuation avant tout usage.
