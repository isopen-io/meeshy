# Plan d'implémentation — Itération 217

## Objectifs
Corriger le comptage/affichage des langues dans l'aperçu public de lien partagé anonyme et
converger le couple normalisation-avec-repli de langue sur un SSOT exporté unique.

## Modules affectés
- `packages/shared/utils/language-normalize.ts` — **nouveau** helper exporté `normalizeLanguageForDedup`.
- `packages/shared/utils/conversation-helpers.ts` — `normalizeInAppLanguage` délègue au helper.
- `services/gateway/src/routes/anonymous.ts` — transform zod (`language`) + agrégat `spokenLanguages`.
- `packages/shared/__tests__/language-normalize.test.ts` — couverture du helper.
- `services/gateway/src/__tests__/unit/routes/anonymous.test.ts` — test de dédup BCP-47.

## Phases
1. **RED** — test route `dedupes BCP-47/region-tagged languages…` (`en-US` + `EN` + `fr` → `['en','fr']`).
   Prouvé rouge par revert temporaire de l'agrégat vers `.toLowerCase()` brut.
2. **GREEN** — helper exporté + convergence des 3 sites + correctif de l'agrégat.
3. **Couverture** — bloc de tests `normalizeLanguageForDedup` dans le shared (casing/region/irreducible).
4. **Validation** — tsc gateway + tsc shared + vitest shared + jest anonymous.

## Dépendances
Aucune (helper pur, sans I/O). Le gateway consomme `@meeshy/shared/dist` → rebuild `bun run build`
du shared requis avant les tests jest gateway.

## Risques estimés
Faible — changement de comportement isolé à l'agrégat `spokenLanguages` ; les deux autres sites
délèguent à une logique strictement identique (idempotente sur codes canoniques).

## Stratégie de rollback
Revert du commit unique. Aucune migration de données, aucune écriture de schéma.

## Critères de validation
- `spokenLanguages: ['en','fr']`, `languageCount: 2` sur l'entrée mixte BCP-47.
- 21/21 `anonymous.test.ts`, 30/30 anonymous, 1391/1391 vitest shared, tsc 0 erreur (gateway+shared).

## Statut de complétion
✅ **Complété** — RED prouvé, GREEN vert, non-régression validée sur toute la surface testable TS.

## Suivi de progression
- [x] Helper `normalizeLanguageForDedup` exporté + JSDoc
- [x] `normalizeInAppLanguage` délègue
- [x] Transform zod `anonymous.ts` délègue
- [x] Agrégat `spokenLanguages` corrigé (4 sites)
- [x] Import `normalizeLanguageCode` inutilisé retiré d'`anonymous.ts`
- [x] Tests RED→GREEN (route + helper)
- [x] tsc gateway + tsc shared + vitest shared + jest anonymous verts

## Améliorations futures
- Normalisation des préférences in-app **à l'écriture** (`MessagingService`) → base auto-cohérente.
- Audit des autres agrégats de langue (analytics/dashboards) pour le même pattern brut.
