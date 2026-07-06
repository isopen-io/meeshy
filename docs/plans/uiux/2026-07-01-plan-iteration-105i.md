# Plan — Itération 105i (2026-07-01) — iOS `AudioEffectsPanel`

**Base** : `main` HEAD (post-104i `ShareLinksView`). **Branche** : `claude/upbeat-euler-vj3vu8`.

## Objectif

Sweep Dynamic Type + VoiceOver du panneau d'effets audio in-call, cible **libre**
(0 PR ouverte) et **génuinement non-migrée** (0 `MeeshyFont.relative` avant).

## Étapes

1. [x] Resync `main` HEAD, supprimer branche mergée 100i.
2. [x] Écarter cibles déjà mûres (`CallView`, `FeedPostCard`) ; choisir `AudioEffectsPanel` (9 `.system(size:)`), numéro 105i > 104i.
3. [x] Migrer 6/9 sites chrome flexible → `MeeshyFont.relative` (weight + `.rounded` préservés) : header (icône+titre), bouton désactiver, chips (icône+label), label son.
4. [x] Garder fixes les 3 fonts de la rangée de mixer `effectSlider` (largeurs rigides 18/55/42) + bloc commentaire doctrine.
5. [x] `.accessibilityHidden(true)` sur les 3 glyphes décoratifs (header, chip, slider).
6. [x] Vérifier : 3 `.system(size:)` restants (mixer figé volontaire ; a11y servie par Slider).
7. [ ] Commit + push + PR + merge `main` (auto-merge routine).
8. [ ] Mettre à jour le pointeur autoritaire iOS (`branch-tracking.md`).

## Contraintes

- 1 fichier, 0 logique, 0 clé i18n neuve, 0 test neuf. Couleurs déjà tokenisées, Glass iOS 26 déjà en place.
- Gate = CI `iOS Tests`.

## Continuité 106i+

**NE PAS re-flagger** `AudioEffectsPanel` (Dynamic Type migré 105i ; 3 fonts de mixer
figées + a11y Slider). **Écarter** `CallView` / `FeedPostCard` (déjà mûrs, fonts fixes
justifiées).

Différé : `FeedView+Attachments` (14), `FeedPostCard+Media` (13),
`BubbleStandardLayout+Media` (12), `StoryTrayView` (9), `OnboardingFlowView` (8),
`StatusBubbleOverlay` (7), `VideoFilterControlView` (7) ; gros lots critiques en
dernier `StoryViewerView+Content` (31, ⚠️ i18n #1174), `ConversationView+Composer`
(22), `ConversationView+MessageRow` (16, prudence Zero-re-render).
# Plan — Iteration 105i (2026-07-01) — iOS Dynamic Type + a11y `VideoFilterControlView`

## Objectif
Rendre `VideoFilterControlView` (panneau de filtres vidéo : header/toggle, 5 sliders, bouton reset)
conforme **Dynamic Type** et combler ses lacunes **VoiceOver** (Toggle + Sliders muets), sans
changer le layout par défaut, la logique ni la palette.

## Piste / numéro
- iOS uniquement (suffixe `i`). 0 PR ouverte (essaim vidé) ; 104i (`ShareLinksView`) mergé #1294 →
  prochain libre **`105i`**. `VideoFilterControlView.swift` non réclamé.
- Base : `main` HEAD `61257034`. Branche : `claude/upbeat-euler-6r2un5` (recréée depuis main).

## Étapes
1. ✅ Resync `main` (104i mergé), reset branche.
2. ✅ Scan : `VideoFilterControlView.swift` = 7 `.font(.system(size:))`, 0 relative, palette
   tokenisée, i18n couvert, Toggle + Sliders sans label a11y. Non réclamé.
3. ✅ **Dynamic Type** : 7/7 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:, design:)`
   (weight + `.rounded`/`.monospaced` préservés). Aucun figé (pas de badge de dimension fixe).
4. ✅ **VoiceOver** : `.accessibilityLabel` sur le Toggle (`video.filter.title`) et sur chaque Slider
   (`label`) ; `.isHeader` sur le titre ; `.accessibilityHidden` sur 3 glyphes décoratifs.
5. ✅ Analyse `2026-07-01-iteration-105i.md` + ce plan + `branch-tracking.md`.
6. ⏳ Commit → push → PR → CI `iOS Tests` verte → merge dans `main` → suppression de branche.

## Invariants
- **0 clé de catalogue neuve** (labels a11y réutilisent `video.filter.title` + le paramètre `label`).
- **0 changement de logique / comportement / layout** à taille Dynamic Type par défaut (`.large`).
- **0 test neuf** (parité 55i/74i/86i/93i/104i).
- **1 seul fichier de production touché**. SDK non touché (`MeeshyFont` via `import MeeshyUI` ligne 2).

## Vérification
- `grep .font(.system(size:` → 0 restant ✅ ; `MeeshyFont.relative` → 7 ; `accessibilityHidden` → 3 ;
  `accessibilityLabel` → 2 (toggle + slider) ; `accessibilityAddTraits` → 1.

## Différé 106i+
`OnboardingAnimations` (17), `ConversationView+MessageRow` (16), `StoryViewerView+Canvas` (13),
`FeedPostCard+Media` (13), `AudioEffectsPanel` (9), `ReelsPlayerView` (7).
</content>
