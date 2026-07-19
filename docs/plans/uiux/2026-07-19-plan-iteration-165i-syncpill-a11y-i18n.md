# Plan — Itération 165i : `SyncPill` (localisation VoiceOver)

**Surface** : `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift`
**Base** : `main` HEAD (`efedb69e4`) · **Branche** : `claude/laughing-thompson-2v80lm` · **Gate** : CI `iOS Tests`

## Objectif
Localiser les deux chaînes VoiceOver codées en dur en français (défaut manqué par 135i, qui n'a traité
que le Dynamic Type). Zéro logique, zéro changement visuel.

## Étapes
1. [x] Cross-référencer les surfaces jamais analysées ; confirmer que `SyncPill` a11y-i18n n'est pas soldé
   (135i = Dynamic Type seulement, conclusion « a11y déjà conforme » **erronée** sur l'i18n).
2. [x] `accessibilityHint` (ligne 163) → `String(localized: "sync.a11y.tap_hint", defaultValue: …, bundle: .main)`.
3. [x] `accessibilityText` cas ≥ 2 signaux (ligne 230) → `String(format: String(localized:
   "sync.a11y.active_signal", defaultValue: "%1$d signaux. Actif : %2$@.", …), entries.count, entry.label)`.
4. [x] Vérifier conventions de format (`%d` counts, `%1$@ : %2$@` positionnel) — conformes au codebase.
5. [x] Rédiger analyse + plan + mise à jour `branch-tracking.md`.
6. [ ] Commit + push `claude/laughing-thompson-2v80lm`. CI `iOS Tests` = gate (build iOS impossible en local
   Linux — validation par la CI macOS).

## Non-régression
- 1 fichier, 0 logique, 0 test neuf, 2 clés i18n `.a11y` (défaut inline, extraction Xcode).
- Suites `SyncPill*Tests` exercent libellés/dérivation/rotation, pas les chaînes a11y → intactes.

## Résultat
Chaînes VoiceOver de `SyncPill` localisées. i18n + Dynamic Type de la surface **soldés** (135i + 165i).
