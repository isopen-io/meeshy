# Iteration 165 — Plan d'implémentation (2026-07-11)

## Objectifs
Corriger `computeStoryDurationMs` (`apps/web/lib/story-transforms.ts`) pour qu'il compte les mots
des overlays texte encodés sous l'alias legacy `content`, alignant son contrat de lecture sur
`parseTextObjects` (`text ?? content`). Sans quoi les stories legacy au texte long auto-avancent
à 6 s au lieu du temps de lecture proportionnel.

## Modules affectés
- `apps/web/lib/story-transforms.ts` — fonction `computeStoryDurationMs`, réduction `totalWords`
  (~4 lignes de prod).
- `apps/web/__tests__/lib/story-transforms-extended.test.ts` — 2 tests ajoutés au `describe`
  `computeStoryDurationMs` existant.

## Phases d'implémentation
1. **RED** — Ajouter le test « alias `content` → temps de lecture » (42 mots → 8000) + le test de
   précédence (`text` court gagne sur `content` long → 6000). Exécuter → échec attendu (6000 reçu).
2. **GREEN** — Lire `t.text ?? t.content` dans le compteur de mots. Réexécuter → vert.
3. **REFACTOR** — Aucun (le changement EST l'alignement sur `parseTextObjects` ; pas de duplication
   à factoriser, les deux lecteurs restent indépendants par design).

## Dépendances
Aucune. Fonction pure, pas de nouvelle dépendance.

## Risques estimés
Très faibles. Le fallback ne s'active que si `text` est absent → overlays modernes inchangés.
Pas de changement de signature/schéma/API/état.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun état persistant impacté.

## Critères de validation
- Suite `story-transforms-extended` verte (71 tests, dont les 2 nouveaux).
- Suites `story-transforms*` vertes (116 tests).
- `tsc --noEmit` : aucune nouvelle erreur imputable à `story-transforms.ts` (les erreurs
  préexistantes `z-index-validator`, `push-token.service`, `connection.service` sont hors périmètre).

## Statut de complétion
✅ Complété. RED confirmé (6000 au lieu de 8000), GREEN après fix, suites `story-transforms*`
vertes (116/116).

## Progress tracking
- [x] Phase 1 — RED
- [x] Phase 2 — GREEN
- [x] Phase 3 — REFACTOR (no-op justifié)
- [x] Validation

## Améliorations futures
- Réaction cross-session (Participant ID vs User ID), `use-reactions-query.ts` — backlog itér. 164.
- `resolveContentRoute` route `friend_story_comment` vers `/story` — backlog latent itér. 163.
