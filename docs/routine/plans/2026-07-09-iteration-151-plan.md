# Iteration 151 — Plan d'implémentation (2026-07-09)

## Objectives
Rétablir l'autocomplete de mention web pour les usernames à tiret (F117) en alignant la
garde de re-validation du handler sur la regex de détection, déjà tolérante au tiret.

## Affected modules
- `apps/web/hooks/composer/useMentions.ts` (production — 1 caractère)
- `apps/web/__tests__/hooks/composer/useMentions.test.tsx` (+2 tests de comportement)

## Implementation phases
1. **RED** — Ajouter deux tests dans le describe `Edge Cases` :
   - `@marie-` → `showMentionAutocomplete === true`, `mentionQuery === 'marie-'`
   - `@marie-claire` → `showMentionAutocomplete === true`, `mentionQuery === 'marie-claire'`
   Vérifier qu'ils échouent (garde `\w` rejette le tiret). ✅ Fait (2 failed).
2. **GREEN** — Remplacer `/^\w{0,30}$/` par `/^[\w-]{0,30}$/` ligne 205. ✅ Fait.
3. **Validation** — Suite complète verte (43/43). ✅ Fait.

## Dependencies
Aucune. `bun install` requis pour exécuter Jest (fait).

## Estimated risks
Négligeable. Un caractère de classe regex ; aligne deux définitions divergentes ; sémantique
inchangée (usernames à tiret déjà valides côté parser/display/backend).

## Rollback strategy
Revert du commit unique. Aucune migration, aucun état persistant, aucun contrat réseau touché.

## Validation criteria
- [x] Tests RED avant fix (2 failed).
- [x] `useMentions.test.tsx` vert après fix (43/43, +2).
- [x] Aucune régression sur underscore / numérique / limite 30 chars.
- [ ] CI verte sur la PR.

## Completion status
- [x] Analyse écrite (`docs/routine/analyses/2026-07-09-iteration-151-analyse.md`)
- [x] Test RED
- [x] Fix GREEN
- [x] Suite verte
- [ ] Commit + push
- [ ] PR

## Progress tracking
Défaut de logique pure, haute confiance, non couvert, en production — corrigé.

## Future improvements
- **F118 (à traiter)** : `POST /posts/:postId/like` renvoie 500 quand on change l'emoji d'une
  réaction (garde `MAX_REACTIONS_PER_USER=1` qui throw, rethrow → `sendInternalError`).
  Nécessite une décision produit : **swap** (aligner post/comment sur le modèle message) vs
  **4xx propre** (mapper `Maximum … reactions` vers `409`). Détails dans l'analyse 151.
