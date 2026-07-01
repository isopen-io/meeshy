# Plan — Itération 95i (2026-07-01) — iOS `SupportView`

**Base** : `main` HEAD `df4e2e5` (post-#1257). **Branche** : `claude/upbeat-euler-m8s80x`.

## Objectif

Sweep a11y de l'écran « Aide et support » (`SupportView.swift`), vue **non réclamée** par les sessions
parallèles (voir analyse 95i pour la carte de contention). Focus : Dynamic Type, VoiceOver rotor, copie de contenu.

## Étapes

1. [x] Resync `main` HEAD, reset branche `claude/upbeat-euler-m8s80x`.
2. [x] Recenser les vues iOS libres (hors PRs ouvertes) → choix `SupportView` (10 `.system(size:)`).
3. [x] Migrer 9/10 `.font(.system(size:))` → `MeeshyFont.relative` (weight + `.rounded` préservés).
4. [x] Garder figé le glyphe badge `fieldIcon` 28×28 + `.accessibilityHidden(true)` + commentaire doctrine.
5. [x] `sectionHeader` → `.accessibilityElement(children:.combine)` + `.isHeader` (rotor).
6. [x] `.textSelection(.enabled)` sur valeurs `infoRow` (Version/Build/Plateforme) + label a11y explicite.
7. [x] `.accessibilityHidden(true)` sur `arrow.up.right` décoratif.
8. [x] Vérifier : 1 seul `.system(size:)` restant (badge figé volontaire).
9. [ ] Commit + push + PR + merge `main` (auto-merge routine).
10. [ ] Mettre à jour le pointeur autoritaire iOS (`branch-tracking.md`).

## Contraintes

- 1 fichier, 0 logique, 0 clé i18n neuve, 0 test neuf. Couleurs déjà tokenisées.
- Gate = CI `iOS Tests`.

## Différé prioritaire iOS 96i+ (hors cibles déjà en PR ouverte)

Une grande surface par itération (vérifier au préalable qu'aucune PR ouverte ne la couvre) :
`ConversationView+MessageRow` (16), `ConversationListView+Overlays` (15),
`FeedView+Attachments` (14), `ConversationMediaGalleryView` (13), `FeedPostCard+Media` (13),
`OnboardingAnimations` (17, prudence : animations), `LicensesView` (10), `CommunityLinkDetailView` (10),
`UserStatsView` (9), `EditPostSheet` (9) ; puis les gros lots critiques `StoryViewerView+Content` (31, ⚠️ collision i18n #1174)
et `ConversationView+Composer` (22) en dernier ; Glass adoption `MessageOverlayMenu` (21, via `AdaptiveGlassContainer`).
