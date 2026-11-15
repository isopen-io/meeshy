# Plan — Itération 77w (Web)

**Analyse** : `docs/analyses/uiux/2026-10-31-iteration-77w.md`
**Base** : `origin/dev` · **Cible PR** : `dev` (auto-merge au vert) · **Branche** :
`claude/practical-fermat-95xnj5`

## Objectif

La bande « Hors ligne » de la zone Progression (hub + pages dédiées) parle la langue
du lecteur, comme les 7 autres bandes hors-ligne du produit. C'était la seule non
traduite.

## Étapes (TDD)

1. **RED** — `routes/progression-offline-notice.test.tsx` : la bande montée en
   anglais sert le catalogue anglais, jamais le littéral français (hub + page).
2. **GREEN** —
   - 2 clés dans la partie `core` du catalogue du jeu, 7 langues :
     `game.page.offline_notice` (hub) et `game.page.offline_notice_brief` (page).
   - Composant pur `ProgressionOfflineNotice({ scope })` dans `progression-shell.tsx`.
   - Câblage : `progression.tsx:254` (`scope="hub"`) et `progression-page.tsx:68`
     (`scope="page"`), import `OfflineNotice` → `ProgressionOfflineNotice`.
3. **Gates** — `type-check`, `game-catalog-parts`, `i18n-game-catalog`,
   `progression`, `check-design-harmony` (inchangé).

## Décision de conception

Clés en `core` et non `concept` : `progression-shell.tsx` est partagé avec l'écran
`rules` qui ne charge pas `concept` → le gate `game-catalog-parts` exige qu'une clé
lue par la coquille vive dans une partie chargée par TOUS ses écrans. Namespace
`game.page.*` (celui de la coquille, voisin de `game.page.back`).

## Résultat

116/116 tests ciblés verts, type-check 0 erreur, harmonie 92/9 inchangée.
Livré par le commit qui porte ce plan. Dimensions mûres : 5, 6, 9, 11, 13.

## ✅ Statut : LIVRÉ (iter-77w) — voir l'analyse pour les pistes 78w+.
