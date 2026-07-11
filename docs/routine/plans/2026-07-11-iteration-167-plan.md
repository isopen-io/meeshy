# Iteration 167 — Plan d'implémentation (2026-07-11)

## Objectifs
Aligner l'invariant « un seul like par user » du like de commentaire REST
(`PostCommentService.likeComment`) sur celui garanti par le chemin socket
(`CommentReactionService.addReaction`, `MAX_REACTIONS_PER_USER = 1`).

## Modules affectés
- `services/gateway/src/services/PostCommentService.ts` — `likeComment` (prod).
- `services/gateway/src/__tests__/unit/PostService.test.ts` — 1 test ajouté.

## Phases
1. **RED** — Test : un like avec emoji différent doit supprimer les réactions
   autre-emoji du user (`deleteMany({ emoji: { not } })`) **avant** l'upsert
   (ordre `invocationCallOrder`). ✅ Échoue sans le fix (vérifié via `git stash`).
2. **GREEN** — Ajouter `deleteMany({ where: { commentId, userId, emoji: { not: emoji } } })`
   avant l'upsert dans `likeComment` ; mettre à jour le commentaire (l'ancien affirmait
   à tort « un seul like par user »). ✅
3. **REFACTOR** — Aucun (changement déjà minimal ; compteurs déjà recomputés depuis
   la table via `syncCommentLikeCounters`).

## Dépendances
Aucune (Prisma `StringFilter.not` déjà disponible ; mock `commentReaction.deleteMany`
déjà présent dans `createMockPrisma`).

## Risques estimés
Très faibles. Sémantique de **remplacement** (pas de throw introduit → pas de 500).
Idempotent sur le même emoji. Broadcast/notification route cohérents (emoji stocké =
emoji broadcasté). Divergence assumée vs socket (remplace au lieu de refuser la
bascule) documentée dans l'analyse.

## Stratégie de rollback
Révertir le commit unique — changement isolé à `likeComment` + 1 test.

## Critères de validation
- `git stash` du service → nouveau test **RED** (1 failed). ✅
- Fix appliqué → `likeComment`/`unlikeComment` + routes comments : **166/166 verts**. ✅
- `tsc --noEmit` : aucune nouvelle erreur sur les fichiers touchés (seule erreur
  résiduelle = `@meeshy/shared` non buildé, préexistante et hors périmètre). ✅

## Statut d'achèvement
**Terminé.** RED→GREEN prouvé, 166/166 verts, docs analyse+plan écrits.

## Progression / suivis futurs
- Réaction cross-session (Participant ID vs User ID) — reporté (cross-couche, non
  validable en runtime ici).
- Parité stricte socket (refuser la bascule d'emoji au lieu de remplacer) : non
  retenue ce cycle — la sémantique de remplacement est plus sûre côté REST (aucun
  500) et l'invariant critique est déjà honoré. À reconsidérer seulement si un client
  envoie un jour un emoji ≠ ❤️ sur ce endpoint et qu'un besoin produit exige le refus.
