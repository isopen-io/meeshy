# Plan Itération 186i — `AudioFullscreenView` : état sélectionné VoiceOver (vitesse + langue)

**Date** : 2026-07-20 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `f80d5fb`
**Branche** : `claude/laughing-thompson-is8ph7` · **Gate** : CI `iOS Tests`

## Objectif

Exposer l'état sélectionné des deux sélecteurs à choix unique de `AudioFullscreenView`
(vitesse de lecture + langue écoutée) à VoiceOver, aujourd'hui signalé par la **couleur
seule** (violation HIG). Prolonge l'a11y de cette surface soldée en 104i (labels icône-seule),
sans toucher aux deux différés connus (`seekBar`, `authorInfoRow`).

## Changements (1 fichier)

`apps/ios/Meeshy/Features/Main/Views/AudioFullscreenView.swift`

1. **`speedRow`** — sur le `Button` de chaque vitesse, après `.background(...)` :
   - `.accessibilityLabel(speed.label)` — annonce explicite (« 1.5× »).
   - `.accessibilityAddTraits(player.speed == speed ? [.isSelected] : [])`.
2. **`languagePill`** — sur le `Button` de chaque pill, après le label :
   - `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` (libellé déjà porté par le
     `Text` intérieur → pas de label ajouté).

Miroir du sibling prouvé `CallsTab.chip` (`CallsTab.swift:60`).

## Contraintes respectées

- 0 logique métier · 0 visuel/layout · 0 clé i18n neuve · 0 test neuf · 0 `.system(size:)`.
- `speed.label` = `PlaybackSpeed.label` (SDK) déjà existant, locale-agnostique.
- Aucun test ne cible `AudioFullscreenView` → 0 régression.

## Vérification

- `git grep` : aucune suite `*Tests` ne référence `AudioFullscreenView`.
- Gate = CI `iOS Tests` (`xcodegen generate` + build-for-testing + tests sur simu 18.2).

## Statut

Implémenté. En attente CI + review.
