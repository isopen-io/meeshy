# Iteration 93 — Plan d'implémentation (2026-07-04)

## Objectif
Corriger F56 : le self-echo socket d'une réaction double-compte `likeCount`/`reactionCount`
(posts non-❤️ + tous les commentaires) parce que l'update optimiste a déjà appliqué `+1` et l'echo
en applique un second. Converger les 4 handlers de réaction sur un delta autoritaire par emoji.

## Affected modules
- `apps/web/hooks/queries/use-post-socket-cache-sync.ts` (seul fichier de prod modifié).
- `apps/web/__tests__/hooks/queries/use-post-socket-cache-sync.test.tsx` (régression).

## Phases

### Phase A — Helper de delta autoritaire
- [x] `reactionDelta(entity, data)` : `aggregation.count − (reactionSummary[emoji] ?? 0)`.
      Pur, générique (Post + PostComment), hoisté (function declaration).

### Phase B — Convergence des handlers post
- [x] `handlePostReactionAdded` → block body, `likeCount`/`reactionCount` += `reactionDelta`,
      `reactionSummary[emoji]` fixé en absolu (inchangé).
- [x] `handlePostReactionRemoved` → `likeCount`/`reactionCount` += `reactionDelta` (≤ 0).

### Phase C — Convergence des handlers commentaire
- [x] `handleCommentReactionAdded` → `likeCount` += `reactionDelta`.
- [x] `handleCommentReactionRemoved` → `likeCount` += `reactionDelta`.

### Phase D — Régression
- [x] Post : self-echo optimiste (delta 0, likeCount inchangé) + reactor distant (delta autoritaire).
- [x] Commentaire : self-echo optimiste ❤️ (delta 0, likeCount inchangé).

### Phase E — Vérification & livraison
- [x] `jest use-post-socket-cache-sync` : **80/80** vert (dont 3 régressions double-comptage).
- [x] `jest use-post-mutations|use-comment-mutations` : **48/48** vert (0 régression optimiste).
- [x] `tsc --noEmit` : aucune erreur sur `use-post-socket-cache-sync.ts` (baseline pré-existant
      1201 erreurs sur fichiers non touchés — inchangé).
- [ ] Commit + push `claude/brave-archimedes-czdq90` ; PR vers `main` ; CI verte ; **merge**.

## Dependencies
Aucune (fichier web isolé, disjoint des PR ouvertes #1445/#1447/#1448).

## Risques estimés
FAIBLE — delta reproduit l'ancien comportement pour les cas remote/frais ; corrige uniquement le
self-echo optimiste. Idempotent. Aucun changement gateway/iOS/shared/schema.

## Rollback strategy
Revert du commit unique — le fichier revient au blind `±1` (comportement HEAD actuel).

## Validation criteria
Voir analyse it.93 « Validation criteria ».

## Statut (mis à jour en fin d'itération)
- [x] Phases A–D appliquées.
- [x] Phase E — tests (80/80 + 48/48) + tsc (0 nouvelle erreur) verts ; reste : push + PR + merge.

## Continuité
Iter 94 : nouveau scout. Pistes report : F55 (reels cache desync edit/delete), F56b (symétrie
gateway absolu), F57 (mentions boundary), F58, F59, F51b (docs notifications).
