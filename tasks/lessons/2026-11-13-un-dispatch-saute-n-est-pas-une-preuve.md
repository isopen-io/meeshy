## 2026-11-13 — Un `workflow_dispatch` « completed » peut n'avoir rien prouvé : sous le gel `CI_DEV_SEUL`, il est sauté (#18048, #18073)

### Ce qui s'est passé

La boucle du Jeu a lancé `ci.yml`, `ios.yml` et `android.yml` à la main sur la tête de #18073 (`ffae6832`). Les
trois runs sont `completed`, et tous leurs jobs `skipped`. Depuis 910068363, la variable `CI_DEV_SEUL` ne laisse
tourner ces workflows que sur `dev`, `main` et `ci/promotion-*`. Une branche de lot ne peut plus être prouvée par
la CI tant que le gel dure.

### La règle

- Lire la `conclusion` de chaque run et de ses jobs, jamais son seul `status`. `completed` + `skipped` est une
  absence de preuve, ni un vert ni un rouge.
- Avant de dispatcher sur une branche de lot, regarder si les derniers runs `workflow_dispatch` des autres branches
  sont `skipped`. Si oui, le gel tient : ne pas dispatcher, et ne sortir aucune PR du brouillon sur une preuve
  absente.
- Pendant le gel, la preuve d'un lot est locale (tests, `tsc`, poids, gardes navigateur avec
  `CHROMIUM=/opt/pw-browsers/chromium_headless_shell-*/…/chrome-headless-shell`). Elle se dit locale dans la PR,
  et la preuve CI se relance à la levée du gel.
