# Iteration 94 — Plan d'implémentation (2026-07-06)

## Objectifs
Éliminer la désynchronisation du cache reels web sur édition / suppression de post (F55), sur les
deux couches (echo socket + mutation optimiste), de manière symétrique aux helpers reels déjà en
place pour like/bookmark/réaction.

## Modules affectés
- `apps/web/hooks/queries/use-post-socket-cache-sync.ts` (prod)
- `apps/web/hooks/queries/use-post-mutations.ts` (prod)
- `apps/web/__tests__/hooks/queries/use-post-socket-cache-sync.test.tsx` (test)
- `apps/web/__tests__/hooks/queries/use-post-mutations.test.tsx` (test)

## Phases
1. **RED** — tests neufs :
   - socket : `post:updated` → légende remplacée dans reels ; `post:deleted` → post retiré des reels.
   - mutations : update optimiste patche reels + rollback ; delete optimiste retire reels + rollback.
2. **GREEN** — prod :
   - socket : `handlePostUpdated` → `patchReelCaches(qc, id, () => post)` ;
     `handlePostDeleted` → `removePostFromReelCaches(qc, id)` (nouveau helper filtre).
   - mutations : update/delete `onMutate` snapshot + patch/filtre reels ; `onError` restaure ;
     nouveau helper `removePostFromReelsCaches`.
3. **REFACTOR** — helpers filtre alignés sur les helpers map existants (mêmes types, même clé
   `reelsFeedKey()`).

## Dépendances
Aucune (web-only). Familles de clés `queryKeys.posts.reelsFeed` déjà en place.

## Risques estimés
FAIBLE — patches reels idempotents / no-op sans cache reels. Rollback couvert par snapshot.

## Stratégie de rollback
Revert du commit ; aucun changement de schéma / migration / API publique.

## Critères de validation
- Suites `use-post-socket-cache-sync` + `use-post-mutations` vertes (dont 6 tests neufs).
- Aucune régression sur le compteur de listeners socket (28).
- `tsc --noEmit` web : 0 nouvelle erreur.

## Statut d'achèvement
- [x] Analyse rédigée
- [x] Prod socket (update + delete → reels)
- [x] Prod mutations (update + delete optimiste + rollback → reels)
- [x] Tests verts — 127/127 (2 suites), dont 6 neufs ; RED confirmé (4 tests comportementaux
  échouent sans le fix)
- [x] tsc web — 0 nouvelle erreur sur les fichiers touchés (baseline projet ~1201 inchangée)
- [x] Commit + push

## Suivi de progression
- Implémentation prod + tests terminés et validés en jest. Lint CLI non exécutable dans cet env
  (bug de résolution eslintrc sous install bun, préexistant, indépendant du diff). Code aligné sur
  les helpers reels existants (mêmes types, même clé).

## Améliorations futures
- F56b / F57 / F58 / F59 (voir analyse it.94).
