# Plan — Iteration 106i (2026-07-01) — iOS Dynamic Type + a11y `AudioEffectsPanel`

## Objectif
Rendre `AudioEffectsPanel` (panneau d'effets vocaux en appel : header/désactiver, sélecteur
d'effets, sliders de paramètres, sélecteur de son) conforme **Dynamic Type** et exposer l'état
sélectionné des chips/sons à **VoiceOver**, sans changer le layout par défaut, la logique, la
palette ni le Glass (déjà adopté).

## Piste / numéro
- iOS uniquement (suffixe `i`). 0 PR ouverte ; 105i (`VideoFilterControlView`) mergé #1297 → prochain
  libre **`106i`**. `AudioEffectsPanel.swift` non réclamé.
- Base : `main` HEAD `7529e54f`. Branche : `claude/upbeat-euler-6r2un5` (recréée depuis main).

## Étapes
1. ✅ Resync `main` (105i mergé), reset branche.
2. ✅ Scan : `AudioEffectsPanel.swift` = 9 `.font(.system(size:))`, 0 relative, palette tokenisée,
   Glass adopté, i18n couvert, sliders déjà labellisés. Non réclamé.
3. ✅ **Dynamic Type** : 9/9 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:, design:)`
   (weight + `.rounded`/`.monospacedDigit()` préservés). Aucun figé.
4. ✅ **VoiceOver** : `.isHeader` sur le titre ; `.accessibilityHidden` sur 3 glyphes décoratifs ;
   `.accessibilityAddTraits(.isSelected)` conditionnel sur le chip d'effet actif + le bouton de son
   actif. Sliders déjà `.accessibilityLabel`/`.accessibilityValue` (inchangés).
5. ✅ Analyse `2026-07-01-iteration-106i.md` + ce plan + `branch-tracking.md`.
6. ⏳ Commit → push → PR → CI `iOS Tests` verte → merge dans `main` → suppression de branche.

## Invariants
- **0 clé de catalogue neuve** (traits a11y déclaratifs).
- **0 changement de logique / comportement / layout** à taille Dynamic Type par défaut (`.large`).
- **0 test neuf** (parité 55i/74i/86i/93i/104i/105i).
- **1 seul fichier de production touché**. SDK non touché (`MeeshyFont` via `import MeeshyUI` ligne 3).

## Vérification
- `grep .font(.system(size:` → 0 restant ✅ ; `MeeshyFont.relative` → 9 ; `accessibilityHidden` → 3 ;
  `isSelected` → 2 ; `isHeader` → 1.

## Différé 107i+
`ReelsPlayerView` (7), `StoryTrayView` (9), `FeedPostCard+Media` (13), `StoryViewerView+Canvas` (13),
`ConversationAnimatedBackground` (12), `OnboardingAnimations` (17), `ConversationView+MessageRow` (16).
</content>
