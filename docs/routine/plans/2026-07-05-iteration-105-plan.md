# Iteration 105 — Plan d'implémentation (2026-07-05)

## Objectifs
Corriger **F72** — normalisation des noms d'inscription (`services/gateway/src/utils/normalize.ts`) :
1. `capitalizeName` capitalise chaque segment (espace / tiret / apostrophe / point), pas seulement
   après un espace.
2. `normalizeDisplayName` retire `\r` en plus de `\n`/`\t` (garantie mono-ligne, fins de ligne Windows).

## Modules affectés
- `services/gateway/src/utils/normalize.ts` — les 2 fonctions pures + JSDoc.
- `services/gateway/src/__tests__/unit/utils/normalize.test.ts` — 2 assertions codifiant le bug
  corrigées + 7 nouveaux cas.
- `services/gateway/src/__tests__/unit/services/AuthService.test.ts` — mock `normalize` réaligné.

## Phases
1. **RED** — repro Node de l'impl d'origine : `Jean-Pierre → Jean-pierre`, `Test\r\nUser → Test\rUser`.
   ✅ prouvé.
2. **GREEN impl** — regex de capitalisation par segment + ajout de `\r`. ✅
3. **Tests** — corriger les 2 assertions buggées, ajouter les cas tiret/apostrophe/accent/`\r`, aligner
   le mock AuthService. ✅
4. **Validation** — `normalize.test.ts` 126/126, `AuthService.test.ts` 115/115,
   `profile-extended.test.ts` 36/36. ✅
5. **Docs** — analyse + plan + leçon. ✅
6. **Commit + push + PR**.

## Dépendances
Aucune (fonctions pures, pas de migration, pas de changement d'API/événement).

## Risques estimés
Très faible. Comportement existant préservé à l'identique (vérifié par 126 tests dont les cas
multi-espaces / préfixe numérique / trim). Seuls les 2 tests qui **codifiaient le défaut** changent.

## Stratégie de rollback
`git revert` du commit unique — 1 fichier de prod + 2 fichiers de test, sans effet de bord.

## Critères de validation
- [x] RED prouvé avant tout code de prod.
- [x] GREEN : 3 suites jest gateway vertes (126 + 115 + 36).
- [x] Non-régression du comportement historique de `capitalizeName`.
- [x] Cohérence `firstName` ↔ `displayName` rétablie sur le scénario d'intégration.

## Statut d'achèvement
**COMPLET** — implémentation + tests + docs. Prêt pour commit/push/PR.

## Suivi de progression
- [x] Analyse rédigée (`docs/routine/analyses/2026-07-05-iteration-105-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] Fix implémenté + tests verts.
- [ ] Commit + push + PR ouverte.

## Améliorations futures
- **F73** : `validatePhoneNumber` web (plafond E.164 en chiffres).
- **F72c** : parité clients natifs iOS/Android sur la capitalisation des noms composés.
- **F69 / F70** : helpers latents / code mort (à câbler avant correction).
