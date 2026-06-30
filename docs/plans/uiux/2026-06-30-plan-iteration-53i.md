# Plan — Iteration 53i (2026-06-30)

## Objectif
Adopter le Liquid Glass natif iOS 26 sur la **capsule flottante du quick-reaction picker**
(`EmojiReactionPicker`, SDK `MeeshyUI`), en préservant le rendu actuel pré-iOS-26. Lot 3 de
la série Glass (51i → 52i → 53i). Borné, épuré, sans changement de comportement.

## Base de départ
- Branche : `claude/upbeat-euler-b625oe`, créée depuis `main` HEAD (resync au début).
- 52i (`MentionSuggestionPanel` + `MiniAudioPlayerBar`, commit `f777a95`) déjà mergé dans
  `main` mais son doc d'analyse/plan n'avait pas été committé et le tracking n'avait pas été
  mis à jour → corrigé dans cette itération (entrées History + Current State).

## Étapes
1. [x] Resync sur `main`, vérifier l'état réel du code (52i mergé : Mention/MiniAudio ont
       déjà `adaptiveGlass`).
2. [x] Identifier la cible propre restante : `EmojiReactionPicker.stripBackground`.
3. [x] Vérifier les 4 call-sites du picker (inline strip, overlay, story, attachment) et la
       sémantique du paramètre `style`.
4. [x] Refactor `EmojiReactionPicker.swift` :
       - `quickEmojiStrip` + `scrollableQuickEmojiStrip` : `.background(stripBackground)` →
         `.modifier(QuickReactionStripChrome(style:))`.
       - Nouveau `private struct QuickReactionStripChrome: ViewModifier` :
         iOS 26 → `.adaptiveGlass(in: Capsule())` neutre + ombre `style`-driven ;
         pré-26 → matériau/voile/liseré/ombre identiques à l'actuel (zéro régression).
       - Supprimer le computed `stripBackground` mort.
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit, push `-u origin claude/upbeat-euler-b625oe`.
7. [ ] Ouvrir PR, attendre CI `iOS Tests` verte.
8. [ ] Merger dans `main`, mettre à jour `branch-tracking.md`, supprimer la branche.

## Hors scope (différé volontaire)
- `EmojiFullPickerSheet.sheetBackground`, `EmojiKeyboardPanel` : surfaces de contenu, pas
  des chromes flottants (verre derrière scroll = anti-lisibilité HIG). Laissés en matériau.
- Wrapper `BubbleStandardLayout+Media` (réactions pièce jointe) : call-site, hors capsule.

## Vérification
- Pas de build SwiftUI local (Linux) → la CI `ios-tests.yml` (compile Xcode 26.1 + tests
  simu 18.2) est le gate. Le smoke test `CompatibilityLayerTests.test_adaptiveGlass_*` reste
  vert (API atome inchangée). Aucun test n'assied le rendu du strip ; comportement (onReact,
  haptique, entrée wave) inchangé.

## Risques
- `style` forcé `.dark` pré-26 sur fond clair système : couvert par le gate local (fallback
  conserve le matériau `style`-driven). iOS 26 : verre échantillonne le contenu → OK partout.
