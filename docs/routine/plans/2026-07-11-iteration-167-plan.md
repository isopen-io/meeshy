# Iteration 167 — Plan d'implémentation (2026-07-11)

## Objectifs
Corriger `resolveBroadcastRecipients` (`services/gateway/src/services/posts/StoryTextObjectTranslationService.ts`)
pour traiter la visibilité `PRIVATE` en fan-out **auteur-seul**, alignée sur le jumeau
`SocialEventsHandler.getVisibilityFilteredRecipients` (`case 'PRIVATE': return []`). Sans ce
guard, le texte traduit d'une story privée fuit vers tous les amis de l'auteur.

## Modules affectés
- `services/gateway/src/services/posts/StoryTextObjectTranslationService.ts` — guard `PRIVATE`
  (3 lignes de prod + commentaire d'intention), inséré après le bloc `COMMUNITY`.
- `services/gateway/src/services/posts/__tests__/StoryTextObjectTranslationService.test.ts` —
  1 test ajouté (`describe` « handleTranslationCompleted — PRIVATE visibility »).

## Phases d'implémentation
1. **RED** — Test « story PRIVATE avec 2 amis → broadcast auteur-seul, `friendRequest.findMany`
   jamais appelé » (échec attendu : fan-out ami inclus).
2. **GREEN** — Ajouter `if (visibility === 'PRIVATE') return [...recipients];`. Réexécuter → vert.
3. **REFACTOR** — Néant (guard minimal, cohérent avec les blocs `ONLY`/`COMMUNITY` existants).

## Dépendances
Aucune. Méthode quasi-pure, pas de nouvelle dépendance.

## Risques estimés
Très faibles. Guard additif ; ne modifie que le cas `PRIVATE`. Aucune autre visibilité impactée.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun état persistant impacté.

## Critères de validation
- `jest StoryTextObjectTranslationService.test.ts` → 22/22 vert.
- `jest src/services/posts` → 192/192 vert.
- `tsc --noEmit` (gateway) → 0 erreur.

## Statut de complétion
✅ Implémenté et validé (RED confirmé, GREEN 22/22, 192/192 posts, tsc propre).

## Suivi progression
- [x] RED — test PRIVATE ajouté, échec vérifié
- [x] GREEN — guard `PRIVATE`
- [x] Validation locale (jest + tsc)

## Améliorations futures
- `TranslationToggle` (web) — Prisme non réactif (langue gelée au montage).
- Reels comment overlay (web) — heart toujours « unliked » → re-like infini.
- `reactionSummary` (web) — chip « 0 » résiduel quand l'emoji était absent.
