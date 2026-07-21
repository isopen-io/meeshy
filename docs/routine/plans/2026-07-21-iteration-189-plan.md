# Plan — Iteration 189 : Sûreté Unicode de la troncature des aperçus de contenu (gateway)

## Objectifs
Propager la doctrine `sliceCodePoints` (découpe par point de code, établie côté
web en 187/188) au **gateway**, qui alimente TOUTES les plateformes. Ne jamais
scinder une paire de substitution lors de la troncature des aperçus de contenu
utilisateur **livrés** : corps de push, sous-titres, `details` d'e-mail, contenu
traduit Prisme, `previewText` des snapshots de réponse, aperçus de réaction.

## Modules affectés
- `packages/shared/utils/text-truncate.ts` (NOUVEAU — SSOT serveur `sliceCodePoints`)
- `packages/shared/utils/index.ts` (export additif)
- `packages/shared/__tests__/utils/text-truncate.test.ts` (NOUVEAU — 7 cas)
- `services/gateway/src/services/notifications/NotificationService.ts` (7 coupes)
- `services/gateway/src/socketio/handlers/CommentReactionHandler.ts` (1)
- `services/gateway/src/socketio/handlers/PostReactionHandler.ts` (1)
- `services/gateway/src/services/messaging/postReplySnapshot.ts` (1)
- `services/gateway/src/services/posts/postReplySnapshot.ts` (1)
- `docs/routine/{analyses,plans}/…-189-*`

## Phases d'implémentation
1. **RED/SSOT** — créer `text-truncate.ts` (`sliceCodePoints`) + tests prouvant
   qu'au même boundary `substring` laisse une demi-paire isolée et `sliceCodePoints`
   non (témoin de régression), + gardes ASCII/astral-exact/multi-astral.
2. **GREEN** — `export` via `utils/index.ts` ; rebuild `dist` shared ; `import` +
   remplacer les 11 coupes gateway par `sliceCodePoints(x, N)` (budget identique).
3. **REFACTOR** — docstring doctrine dans `text-truncate.ts` ; `core.ts`
   `truncateMessagePreview` laissé inchangé (sémantique compte-de-points-de-code).

## Dépendances
`dist` shared doit être rebuild (gateway importe `@meeshy/shared` depuis `dist`).
Prisma client généré pour un typecheck gateway propre (prérequis d'environnement).

## Risques estimés
Faibles. Util pur testé + substitutions mécaniques. ASCII bit-pour-bit préservé ;
invariant « sortie ≤ N unités UTF-16 » préservé (borne aval APNs/DB intacte).
Aucun changement de schéma/état/réseau.

## Stratégie de rollback
Revert du commit unique — 8 fichiers (dont 2 nouveaux), aucune migration, aucun
état persistant. Le nouvel util est additif : aucun consommateur préexistant.

## Critères de validation
- shared vitest : `text-truncate.test.ts` 7/7 ; suite complète 1389/1389.
- gateway `tsc --noEmit` : 0 erreur (après prisma generate).
- gateway jest ciblé : postReplySnapshot + Comment/PostReactionHandler 52/52.
- Échec `NotificationService.*` (temp-config) confirmé PRÉ-EXISTANT via `git stash`
  (import `preferences/index.ts → ./privacy.js`, artefact d'environnement).

## Statut : COMPLETED

## Progress tracking
- [x] SSOT `sliceCodePoints` + tests (7/7)
- [x] NotificationService (7 coupes)
- [x] Comment/PostReactionHandler (2)
- [x] postReplySnapshot ×2 (2)
- [x] Typecheck gateway 0 erreur + suites ciblées vertes
- [x] Analyse + plan documentés

## Future improvements
Migration web `sliceCodePoints` → SSOT shared ; variante compte-de-points-de-code
pour dédupliquer `truncateMessagePreview` ; câbler/supprimer `notification-translations.ts`.
