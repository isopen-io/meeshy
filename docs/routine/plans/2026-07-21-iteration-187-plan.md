# Plan — Iteration 187 : Sûreté Unicode des dérivations de chaînes (web)

## Objectifs
Propager la doctrine Unicode déjà mergée (`name-similarity.normalizeName` NFD-fold,
itér. 185 ; `initials.ts` découpe par point de code) aux deux derniers utils web
live qui la manquaient :
1. `community-identifier.ts` — replier les diacritiques latins au lieu de les supprimer.
2. `truncate.ts` — tronquer par point de code, jamais couper une paire de substitution.

## Modules affectés
- `apps/web/utils/community-identifier.ts` (+ helper `foldDiacritics`)
- `apps/web/utils/truncate.ts` (+ helper `sliceCodePoints`)
- `apps/web/__tests__/utils/community-identifier.test.ts` (test trompeur remplacé + cas ajoutés)
- `apps/web/__tests__/utils/truncate.test.ts` (2 cas surrogate ajoutés)
- `docs/routine/{analyses,plans}/…-187-*`

## Phases d'implémentation
1. **RED** — étendre les 2 fichiers de test : diacritiques (2 cas gen + 1 sanitize)
   + surrogate (`truncateText`, `truncateFilename`). Prouver l'échec sur le code actuel.
2. **GREEN** — `foldDiacritics` + application (2 sites) ; `sliceCodePoints` +
   application (3 sites `truncateFilename`) ; `truncateText` → `[...text]`.
3. **REFACTOR** — docstrings alignées sur la doctrine ; test trompeur `'…removing them'`
   réécrit en vrais cas accentués.

## Dépendances
Aucune (utils purs, aucune signature modifiée, aucun importeur impacté).

## Risques estimés
Très faibles. Comportement ASCII bit-pour-bit préservé (1017/1017 tests utils verts).
Invariant « `truncateFilename` ne dépasse jamais `maxLength` » préservé par construction.

## Stratégie de rollback
Revert du commit unique — 4 fichiers, aucune migration, aucun état persistant.

## Critères de validation
- RED → GREEN prouvé (52/52 sur les 2 suites ciblées).
- 38 suites `__tests__/utils` → 1017/1017.
- `tsc --noEmit` propre sur les fichiers touchés.

## Statut : COMPLETED

## Suivi de progression
- [x] RED tests (community-identifier + truncate)
- [x] GREEN fix (foldDiacritics + sliceCodePoints)
- [x] Non-régression 1017/1017
- [x] tsc propre
- [x] Analyse + plan
- [ ] Commit + push + PR

## Améliorations futures (itération 188+)
- `link-name-generator.ts` (l.50/59) : même `sliceCodePoints` sur le titre de conversation.
- `validateMessageContent` : aligner trim entre check vacuité et check longueur.
- `getLanguageInfo` : normaliser le `code` retourné comme `name`/`flag`.
