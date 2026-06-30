# Plan — Iteration 69i (2026-06-30)

## Objectif
iOS only. Épuration palette : remplacer les couleurs **sémantiques** codées en dur
(`#2ECC71` → vert état, `#3498DB` → bleu info) par les tokens `MeeshyColors.success` /
`MeeshyColors.info`. Solde le différé explicite de 68i. Itération bornée, « logique
épurée », zéro changement de comportement/layout.

## Base
- Branche : `claude/upbeat-euler-ddel9j` (resynchronisée sur `main` HEAD `3b0b596`,
  post-#1088 / post-53i / post-68i).

## Changements

### 1. `apps/ios/.../Components/ContactCardView.swift` (app)
- [x] Icône téléphone : `Color(hex: "2ECC71")` → `MeeshyColors.success`.
- [x] Icône email : `Color(hex: "3498DB")` → `MeeshyColors.info`.
- [x] Inchangé : `Color(hex: accentColor)` (dynamique), liséré dégradé, `adaptiveGlass`.

### 2. `apps/ios/.../Views/AffiliateView.swift` (app)
- [x] Icône partager : `Color(hex: "2ECC71")` → `MeeshyColors.success` (cohérence avec le
      bouton frère « supprimer » déjà en `MeeshyColors.error`).

### 3. Exclusions documentées (aucune édition)
- [x] `FeedView+Attachments.swift:1011` dégradé location `[#2ECC71, #27AE60]` : **laissé**
      (dégradé décoratif, `#27AE60` sans token). Documenté dans l'analyse.

## Vérification
- [x] `grep` : plus aucun `Color(hex: "2ECC71")`/`Color(hex: "3498DB")` en foreground
      sémantique ; seul subsiste le dégradé location (exclu, décoratif).
- [x] `MeeshyColors` résolu app-wide via `@_exported import MeeshyUI` — aucun import ajouté.
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build (pas de
      build SwiftUI local sur Linux).

## Merge
- [ ] Push `claude/upbeat-euler-ddel9j`, PR → `main`, merge après CI verte. Supprimer la
      branche. Mettre à jour `branch-tracking.md` (base 70i = main post-merge 69i).
