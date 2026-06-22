# Plan — Itération 57w (web)

## Objectif
Internationaliser `components/feed/ReelPlayer.tsx` (lecteur de reels plein écran,
partagé `/feed/reels` + `/reel/:id`) — 12 chaînes FR figées, majoritairement
`aria-label`/`sr-only` (régression a11y multilingue + rupture Prisme).

## Base
- Partir de `main` HEAD `db1f1fd` (post-#771 iter-56w mergé par agent parallèle).
- Branche de travail : `claude/practical-fermat-r4vwgd`.

## Étapes
1. [x] Resynchroniser la branche sur `main` HEAD.
2. [x] Ajouter le bloc `reel.player.*` (13 clés) ×4 locales (`en/fr/es/pt`).
3. [x] Câbler `useI18n('reel')` dans `ReelPlayer.tsx`.
4. [x] Remplacer les 12 chaînes FR par `t('player.*')` (fallback EN 2e arg pour
   les simples, params pour `counter`/`srHeading`/`mediaAlt`).
5. [x] Vérifier : zéro chaîne FR résiduelle, parité 13 clés ×4, JSON valide.
6. [x] Rédiger analyse 57w + mettre à jour `branch-tracking.md`.
7. [ ] Commit + push + PR ; merge dans `main` une fois le CI vert.

## Risques
- Faible : swap i18n pur sur le pattern `t()` existant ; namespace `reel` déjà
  chargé côté runtime (53wb). Pas de node_modules dans le container → typecheck CI.

## Clés ajoutées (`reel.player.*`)
counter, srHeading, mediaAlt, play, close, previous, next, mute, unmute, like,
comment, share, save.
</content>
