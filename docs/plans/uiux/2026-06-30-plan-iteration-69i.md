# Plan — Iteration 69i (2026-06-30)

## Objectif
iOS only. Poursuivre l'adoption native iOS 26 Liquid Glass sur la dernière grosse surface de
chrome flottant non convertie (`ReplyThreadOverlay`, carte modale de thread de réponses) et
épurer l'a11y de l'overlay (bouton fermeture sans label, drag-indicator + skeleton décoratifs).
Itération bornée, « logique épurée », continuité directe de 51i/68i.

## Base
- Branche : `claude/upbeat-euler-dgnlfu` (resynchronisée sur `main` HEAD `b0c15b6`, post-#1081).

## Changements

### 1. `apps/ios/.../Views/ReplyThreadOverlay.swift` (app)
- [x] Carte de thread : `.background(RoundedRectangle(18).fill(theme.surfaceGradient(tint:))
      .overlay(stroke))` → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: 18, style:
      .continuous), tint: Color(hex: accentColor).opacity(0.18))` + `.overlay(stroke)` conservé
      (liseré de marque) + `.clipShape(18)` + ombre d'accent inchangés.
- [x] Bouton de fermeture (`xmark.circle.fill`) → `.accessibilityLabel("common.close" → « Fermer »)`
      (réutilisation clé i18n existante).
- [x] `dragIndicator` (capsule décorative) → `.accessibilityHidden(true)`.
- [x] `skeletonContent` (3 lignes shimmer décoratives) → `.accessibilityHidden(true)`.
- [x] Scrim de fond + fonds de lignes du thread : **inchangés** (contenu, pas du chrome —
      conforme doctrine Liquid Glass).

### 2. Tests
- [x] Aucune extension requise : `CompatibilityLayerTests` couvre déjà `RoundedRectangle` +
      la variante teintée d'`adaptiveGlass` (lignes 70/85, ajoutées par 68i). La surface API de
      69i est donc déjà exercée.

## Vérification
- [x] `grep` : `surfaceGradient` n'est plus référencé dans le fichier (n'était utilisé que par
      le card converti) ; `adaptiveGlass` appliqué après le `.frame(maxHeight:)` (« apply LAST
      after sizing »), forme du verre == forme du `.clipShape` (pas d'artefact de clip).
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur) — seule vérif de build (pas de
      build SwiftUI local sur Linux).

## Merge
- [ ] Push `claude/upbeat-euler-dgnlfu`, PR → `main`, merge après CI verte. Supprimer la
      branche. Mettre à jour `branch-tracking.md` (base 70i = main post-merge 69i).
