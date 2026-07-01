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
