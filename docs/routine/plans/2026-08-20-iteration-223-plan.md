# Iteration 223 — Plan : `$`-safe i18n interpolation dans l'UI d'appel vidéo web

## Objectives
Éradiquer la classe de bug `$`-sequence de l'interpolation i18n manuelle du frontend web, en routant
les noms d'affichage contrôlés par l'utilisateur par le chemin `t(key, params)` (replacer-fonction
déjà `$`-safe), sur les sites d'UI d'appel vidéo en temps réel.

## Affected modules
- `apps/web/components/video-calls/CallQualityOverlay.tsx` (3 sites)
- `apps/web/components/video-calls/VideoStream.tsx` (1 site)
- Tests : `CallQualityOverlay.test.tsx`, `VideoStream.test.tsx`, `VideoCallInterface.test.tsx`

## Implementation phases
1. **RED** — mock `t` aligné sur le replacer-fonction réel + test nom `A$&B $$ C$'D` (fuite `{name}`).
2. **GREEN** — `t('clé').replace('{name}', nom)` → `t('clé', { name: nom })`.
3. **Non-régression** — `VideoCallInterface.test.tsx` : mock `t` mis à niveau (support `params`).
4. **Validation** — `jest __tests__/components/video-calls/` + `tsc` (delta nul sur fichiers changés).

## Dependencies
`bun install --ignore-scripts` ; `packages/shared` buildé (mapping `@meeshy/shared/* → dist`).

## Estimated risks
Très faible : sémantique first-occurrence préservée, chemin i18n canonique, tests existants verts.

## Rollback strategy
Revert du commit unique — 5 fichiers, aucune API/schéma/état. Chaque site redevient un `.replace`.

## Validation criteria
- RED prouvé, GREEN vérifié (125/125 video-calls).
- Zéro nouvelle erreur tsc sur les fichiers changés.
- Noms ordinaires inchangés (non-régression).

## Completion status
**COMPLETED** — implémenté, testé (125/125), documenté.

## Progress tracking
- [x] Analyse + audit anti-doublon (8 PRs)
- [x] RED (CallQualityOverlay + VideoStream)
- [x] GREEN (composants)
- [x] Non-régression VideoCallInterface
- [x] Validation jest + tsc
- [x] Docs analyse + plan

## Future improvements
- Convergence des sites `t(...).replace(...)` semi-contrôlés (emoji picker, email settings).
- Lint-rule bannissant `t(...).replace(...)` au profit de `t(key, params)` (garde structurelle).
