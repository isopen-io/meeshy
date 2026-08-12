# Iteration 164 — Plan d'implémentation (2026-07-10)

## Objectif
F123 — `PostService.getPostInteractions` : lire les réactions du panneau « vues » de l'auteur
depuis la table `PostReaction` (SSOT) plutôt que depuis le JSON legacy `post.reactions` (jamais
mis à jour par le chemin socket).

## Modules affectés
- `services/gateway/src/services/PostService.ts` (`getPostInteractions`, ~8 lignes)
- `services/gateway/src/__tests__/posts-interactions-reaction-source.test.ts` (nouveau, 3 tests)

## Phases
1. **RED** — nouveau test unitaire : réaction socket (ligne `PostReaction`, `post.reactions`
   vide) doit surfacer dans `viewers[i].reaction` ; JSON legacy stale ignoré ; viewer sans
   réaction → `null`. Échoue contre l'ancien code (lit `post.reactions`).
2. **GREEN** — dériver `reactionByUser` de `postReaction.findMany`, plié dans le `Promise.all`
   existant ; retirer `reactions: true` du `select`.
3. **REFACTOR** — aucun (fix minimal, aligné sur le précédent `enrichWithLikeStatus`).

## Dépendances
Aucune (pas de migration, pas de nouveau champ, contrat de retour inchangé).

## Risques estimés
Faible. Le JSON legacy cesse d'être lu ; tous les autres consommateurs lisent déjà la table.
Contrat `{ viewers, total, hasMore }` inchangé.

## Stratégie de rollback
Revert du commit unique (source + test isolés).

## Critères de validation
- Nouveau fichier de test : 3/3 GREEN, RED confirmé contre l'ancien code.
- Suites `posts` gateway vertes.
- `tsc --noEmit` : aucune nouvelle erreur sur `PostService.ts`.

## Statut d'achèvement
- [x] Analyse rédigée
- [x] Test RED écrit — RED confirmé (2/3 échouent contre l'ancien code)
- [x] Fix appliqué
- [x] GREEN validé (3/3 ; suites `posts`/`interactions` 309/309)
- [x] tsc propre (0 nouvelle erreur ; seules `login.ts`/`magic-link.ts` préexistent)
- [x] Commit + push + PR

## Améliorations futures
- Auditer les autres lectures résiduelles de `post.reactions` (grep : uniquement les écritures
  `likePost`/`unlikePost` subsistent après ce cycle — plus aucun lecteur).
