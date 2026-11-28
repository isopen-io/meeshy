# Décisions

## Prises par la passe du 2026-11-27

| Décision | Raison |
|---|---|
| Ne pas toucher aux Dockerfiles | ramener les images sous les épingles fait repasser `zod` de 4.6.7 à 4.4.3 en production : c'est un changement de validation servi, et son ordre avec #6235 revient au porteur (#20730) |
| Ne pas doubler la PR #20719 | elle répare déjà le rouge de `packages/shared` sur `dev` ; qui a écrit le premier garde le lot |
| Ne pas ajouter de hooks bloquants | `.claude/settings.json` est partagé par toutes les sessions vivantes ; un hook neuf non éprouvé les arrêterait toutes |
| Ne pas créer un second `CLAUDE.md` racine | il existe et fait foi |
| `BACKLOG.md` et `RISK-REGISTER.md` en index | l'état d'une tâche vit dans son issue (`CLAUDE.md` § Pilotage) |
| Monter les épingles sans toucher `pnpm-lock.yaml` | pnpm ne lit pas le champ `overrides` racine ; le lockfile ne change pas |

## Laissées au porteur

| Question | Issue |
|---|---|
| Aligner les images sur les épingles avant ou après le passage des 242 bornes à l'unité de zod 4.5 | #20730 |
| Garder `.amsf/` dans le dépôt, à côté du pilotage par issues | #20734 |
