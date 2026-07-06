# Iteration 103 — Plan d'implémentation (2026-07-05)

## Objectifs
Corriger **F68** : `getInitials` (SSOT des initiales d'avatar web) produit une **demi-paire de
substitution UTF-16 isolée** (glyphe cassé `�`) pour les noms d'affichage contenant un emoji hors BMP.

## Modules affectés
- `apps/web/utils/initials.ts` (fonction pure `getInitials`) — source unique.
- `apps/web/__tests__/utils/initials.test.ts` (tests).
- Bénéficiaires transitifs (aucune modification) : `apps/web/lib/avatar-utils.ts`
  (`getUserInitials`/`getMessageInitials`) + 8 appelants directs de composants.

## Phases
1. **RED** — reproduire (`getInitials('🎨 Studio')` → `"\uD83CS"`, `isWellFormed() === false`). ✅
2. **GREEN (source)** — découpage par point de code (`[...word]`) dans les deux branches. ✅
3. **Tests** — 5 cas emoji (multi-mot, dernier-mot, deux-bouts, mot-unique bi-emoji, latin+emoji)
   + assertions `isWellFormed()`. ✅
4. **Validation** — jest `initials.test.ts` 22/22 ; non-régression des 17 cas ASCII/latin. ✅
5. **Docs** — analyse + plan. ✅
6. **Commit + push + PR** vers `claude/brave-archimedes-fo6hrw`.

## Dépendances
Aucune. Fonction pure, sans import runtime, sans migration.

## Risques estimés
Très faibles. Comportement identique sur ASCII/latin (`slice(0,2)` BMP ≡ `[...].slice(0,2)`) ;
corrigé sur le hors-BMP. Pas de changement de signature/contrat.

## Stratégie de rollback
Revert du commit unique — 2 fichiers, aucun effet de bord, aucune donnée persistée.

## Validation criteria
- [x] RED prouvé (repro Node).
- [x] GREEN Node (12 cas mixtes, `isWellFormed` partout vrai).
- [x] GREEN jest 22/22.
- [ ] CI verte après push.

## Completion status
- [x] F68 implémenté, testé (jest 22/22), documenté.
- Candidats écartés documentés (F69 `sanitizeFileName` 0-appelant, F70 `deepClean…` code mort).

## Progress tracking
- Itération 103 : F68 (getInitials emoji surrogate-pair). **DONE** (en attente merge).

## Future improvements
- F69 (LOW) : `sanitizeFileName` plafond 255 sur nom sans extension (latent).
- F70 (LOW) : `deepCleanTranslationOutput` apostrophes FR (code mort).
- F68b (LOW) : parité iOS des initiales (Swift itère par grapheme cluster → à confirmer sain).
