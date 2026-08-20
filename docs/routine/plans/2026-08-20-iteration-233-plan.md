# Plan d'implémentation — Iteration 233

## Objectifs
Rétablir l'invariant de parallélisme `pages.length === pageParams.length` du cache infini des
conversations (`queryKeys.conversations.infinite()`), violé par la branche de page de surplus de
`rebuildInfiniteConversationPages`.

## Modules affectés
- `apps/web/lib/conversations/infinite-cache.ts` (source — le point d'écriture structuré unique du
  cache, partagé par `use-socket-cache-sync.ts` et `use-conversations-delta-sync.ts`).
- `apps/web/lib/conversations/__tests__/infinite-cache.test.ts` (nouveau — test pur).

## Phases d'implémentation
1. **RED** — écrire `infinite-cache.test.ts` : factory de pages OFFSET (limit 2, 2 pages), assertions
   de parité `pages ↔ pageParams`, du param de la page de surplus (= son offset), et de la
   non-croissance du désync sur insertions répétées. Confirmer l'échec (3 pages / 2 params).
2. **GREEN** — dans `infinite-cache.ts`, reconstruire `pageParams` : `const rebuiltPageParams =
   [...old.pageParams]`, `rebuiltPageParams.push(cursor)` dans la branche de surplus, retourner
   `pageParams: rebuiltPageParams`. Confirmer le vert.
3. **REFACTOR** — aucun (le correctif est déjà minimal et local).

## Dépendances
- Aucune. Fonction pure ; aucun changement d'API, de type public ou de contrat réseau.

## Risques estimés
- Négligeable. React Query 5.101.4 se recalait déjà au refetch (mesuré sur `infiniteQueryBehavior`) ;
  le correctif ne change aucun comportement observable, il rend la structure conforme au contrat.

## Stratégie de rollback
- Revert du commit unique. Zéro migration, zéro état persistant modifié (la structure reste
  `InfiniteData`, seule sa cohérence interne s'améliore).

## Critères de validation
- [x] Test RED prouvant le désync (2 assertions rouges).
- [x] Test GREEN après correctif (3/3 verts).
- [x] Suites appelantes vertes : `use-conversations-query` + dedupe + pagination-rq (30),
      `use-socket-cache-sync` ×2 + `use-conversations-delta-sync` (158) = **188 verts**.
- [x] `tsc --noEmit` : zéro nouvelle erreur (baseline 1267 inchangé).
- [ ] CI verte sur la PR (gate lint/bun réel).

## Statut de complétion
- **Implémenté et validé localement.** En attente CI.

## Suivi de progression
- Correctif appliqué, tests verts, docs écrites, commit + push branche.

## Améliorations futures (hors périmètre de cette itération)
- **Dette de type pré-existante** : les pages construites par `rebuildInfiniteConversationPages`
  (et par le test) n'ont pas `deletedConversationIds` / `deletedConversationIdsTruncated`, requis par
  `GetConversationsResponse`. Le type de page du cache mériterait d'être un sous-type
  (`Pick`/`Omit`) plutôt que `GetConversationsResponse` complet, ces champs étant purement
  delta-réseau. Candidat propre pour une itération dédiée.
- **Candidats survey non retenus cette fois** (à reprendre) : (#2) markdown attachments routés vers
  le viewer texte — `separateAttachmentsByType` remplit `texts` et jamais `markdowns`, laissant
  `MessageAttachments.tsx` + `openMarkdownLightbox` en branche morte ; besoin d'un arbitrage produit
  (feature perdue vs code mort). (#3) `transcriptionSegmentSchema` accepte `endMs < startMs` — durcir
  via `.refine`, cohérent avec la sanité numérique déjà affirmée (`nonnegative`).
