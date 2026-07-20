# Plan — Itération 100i (2026-07-01) — iOS `EditPostSheet`

**Base** : `main` HEAD `6775ec47` (post-#1248 / iter 95i). **Branche** : `claude/upbeat-euler-vj3vu8`.

## Objectif

Sweep a11y de la feuille d'édition de post (`EditPostSheet.swift`), vue **non
réclamée** par les ~20 sessions parallèles (voir analyse 100i pour la carte de
contention). Focus : Dynamic Type + VoiceOver (labels manquants), feature iOS native.

## Étapes

1. [x] Resync `main` HEAD, reset branche + supprimer branche mergée 95i.
2. [x] Recenser cibles libres (hors 32 PRs ouvertes) → choix `EditPostSheet` (9 `.system(size:)`), numéro 100i > 99i en vol.
3. [x] Migrer 7/9 `.font(.system(size:))` → `MeeshyFont.relative` (weight préservé) : TextEditor, compteur, Publier, libellé/valeur/Auto langue, chevron.
4. [x] Garder figés les 2 glyphes de vignette 64×64 (18 retirer, 22 média) + commentaire doctrine.
5. [x] `.accessibilityLabel` sur le bouton retirer/restaurer média (lacune comblée).
6. [x] `.accessibilityHidden(true)` sur l'icône média décorative.
7. [x] `.accessibilityLabel` sur le TextEditor + le compteur de caractères.
8. [x] Vérifier : 2 `.system(size:)` restants (vignette figée volontaire).
9. [ ] Commit + push + PR + merge `main` (auto-merge routine).
10. [ ] Mettre à jour le pointeur autoritaire iOS (`branch-tracking.md`).

## Contraintes

- 1 fichier, 0 logique, 4 clés i18n neuves suffixées `.a11y` (labels VoiceOver), 0 test neuf. Couleurs déjà tokenisées.
- Gate = CI `iOS Tests`.

## Continuité 101i+

**NE PAS re-flagger** `EditPostSheet` (Dynamic Type migré ; 2 glyphes de vignette
figés + labellisés/hidden en 100i).

Différé prioritaire (une cible par itération, vérifier PR ouvertes) :
`FeedView+Attachments` (14), `FeedPostCard+Media` (13), `BubbleStandardLayout+Media`
(12), `StoryTrayView` (9), `FeedPostCard` (9, + sélection texte du corps),
`AudioEffectsPanel` (9), `OnboardingFlowView` (8), `CallView` (8) ; gros lots
critiques en dernier : `StoryViewerView+Content` (31, ⚠️ i18n #1174),
`ConversationView+Composer` (22), `ConversationView+MessageRow` (16, prudence
Zero-re-render) ; `OnboardingAnimations` (17, décoratif).
