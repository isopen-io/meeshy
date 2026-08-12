# Plan — Iteration 56i (2026-06-30)

## Objectif
iOS only. Épuration palette : consolider les teintes sémantiques « flat-UI » hors-charte
(`#2ECC71`, `#3498DB`, `#27AE60`) vers les tokens `MeeshyColors` (Single Source of Truth).
Itération bornée, « logique épurée », swap de tokens pur (zéro changement de comportement).
Continuité directe du différé « palette tokens » de 53i.

## Base
- Branche : `claude/upbeat-euler-1zicez` (resynchronisée sur `main` HEAD post-#1088).

## Changements

### 1. `apps/ios/.../Components/ContactCardView.swift`
- [x] Icône téléphone : `Color(hex: "2ECC71")` → `MeeshyColors.success`.
- [x] Icône e-mail : `Color(hex: "3498DB")` → `MeeshyColors.info`.

### 2. `apps/ios/.../Views/AffiliateView.swift`
- [x] Bouton partager : `Color(hex: "2ECC71")` → `MeeshyColors.success` (paire cohérente avec
      le bouton supprimer adjacent déjà en `MeeshyColors.error`).

### 3. `apps/ios/.../Views/FeedView+Attachments.swift`
- [x] Dégradé vignette localisation : `[Color(hex: "2ECC71"), Color(hex: "27AE60")]` →
      `[MeeshyColors.success, MeeshyColors.successDeep]` (cohérence avec le bouton position
      du même composer, déjà en `MeeshyColors.success`).

### Exclus délibérément
- [x] Ladder catégoriel composer (emoji `#F8B500`, fichier `#9B59B6`) : **non touché** —
      couleurs par catégorie, décision de charte unique (différé).

## Vérification
- [x] `grep` : 0 occurrence résiduelle de `2ECC71`/`3498DB`/`27AE60` dans `apps/ios/Meeshy/`.
- [x] `MeeshyColors` accessible via `import MeeshySDK` (`@_exported MeeshyUI`) — déjà utilisé
      dans AffiliateView (`.error`) et FeedView+Attachments (`.success`).
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build.

## Merge
- [ ] Push `claude/upbeat-euler-1zicez`, PR → `main`, merge après CI verte. Supprimer la
      branche. Mettre à jour `branch-tracking.md` (base 55i = main post-merge 54i).
