# Plan d'implémentation — Iteration 235

## Objectifs
Éteindre la dette de type consignée par l'itération 233 : le type de page du cache infini des
conversations (`InfiniteConversationData['pages']`) surdéclarait `deletedConversationIds` /
`deletedConversationIdsTruncated`, deux métadonnées d'enveloppe delta qu'aucune page STOCKÉE ne
porte — d'où 2 erreurs `tsc` TS2345 dans `rebuildInfiniteConversationPages`.

## Modules affectés
- `apps/web/lib/conversations/infinite-cache.ts` (source — nouveau type `InfiniteConversationPage`).
- `apps/web/lib/conversations/__tests__/infinite-cache.test.ts` (factory simplifiée + 1 test de garde).

## Phases d'implémentation
1. **RED** — reproduire les 2 erreurs `tsc` TS2345 (lignes 49, 72) : les pages construites par
   `rebuildInfiniteConversationPages` (`{ conversations, pagination }`) ne satisfont pas
   `GetConversationsResponse[]`. Confirmé (total web 1267, dont 2 sur `infinite-cache.ts`).
2. **GREEN** — introduire `export type InfiniteConversationPage = Omit<GetConversationsResponse,
   'deletedConversationIds' | 'deletedConversationIdsTruncated'>` et typer `pages` dessus.
   Aligner le test : `page()` renvoie `InfiniteConversationPage`, + un test verrouillant que les
   pages reconstruites ne portent QUE `conversations` + `pagination`. Confirmer le vert (0 erreur
   sur le fichier ; total 1265 ; 4/4 tests).
3. **REFACTOR** — aucun (le corps de `rebuildInfiniteConversationPages` est inchangé — il
   construisait déjà les bonnes pages ; seul le type les décrit désormais correctement).

## Dépendances
- Aucune. Changement au niveau type + test ; aucun changement d'API, de comportement runtime ou de
  contrat réseau. Les deux appelants passent par l'alias `InfiniteConversationData` explicitement
  annoté — découplés du type inféré de React Query.

## Risques estimés
- Négligeable. `Omit<…>` reste un SUPERTYPE structurel de `GetConversationsResponse` (une réponse
  complète reste assignable à la page). Aucun lecteur ne lit les champs retirés sur une page
  stockée (vérifié par grep : seuls fetch/`crud.service`/`delta-sync` les touchent).

## Stratégie de rollback
- Revert du commit unique. Zéro migration, zéro état persistant modifié.

## Critères de validation
- [x] RED : 2 erreurs `tsc` TS2345 reproduites avant correctif.
- [x] GREEN : 0 erreur sur `infinite-cache.ts` ; total web 1267 → **1265**.
- [x] `infinite-cache.test.ts` : 4/4 verts (garde d'enveloppe incluse).
- [x] Non-régression : 191 tests appelants verts.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Statut de complétion
- **Implémenté et validé localement.** En attente CI.

## Suivi de progression
- Type `InfiniteConversationPage` introduit, `pages` re-typé, test aligné + garde ajoutée, `tsc`
  -2, suites vertes, docs écrites, commit + push branche.

## Améliorations futures (hors périmètre de cette itération)
- **Candidats survey non retenus cette fois** (à reprendre) : markdown attachments routés vers le
  viewer texte — `separateAttachmentsByType` remplit `texts` et jamais `markdowns`, laissant
  `MessageAttachments.tsx` + `openMarkdownLightbox` en branche morte ; besoin d'un arbitrage
  produit (feature perdue vs code mort) avant tout changement.
- **Dépouillement des 24 fabriques `jest.mock('@meeshy/shared', …)` mortes** (documenté dans
  `apps/web/CLAUDE.md`) — aucun défaut de justesse, mais du code mort qui se lit comme une source
  de vérité. Candidat propre pour une passe de nettoyage dédiée.
