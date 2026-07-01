# Plan — Itération 95i (iOS)

**Date** : 2026-07-01
**Cible** : `apps/ios/Meeshy/Features/Main/Views/TwoFactorSetupView.swift`
**Type** : Accessibilité (VoiceOver) + sélection/copie de contenu — sweep additif
**Base** : `main` HEAD `e8a3b73`

## Objectif

Combler 2 lacunes UX/a11y sur l'écran de sécurité 2FA, alignées avec la demande
produit (sélection/copie de contenu, gestes/features iOS naturels) — sans toucher
au layout ni à la logique.

## Changements (tous additifs)

### 1. `.textSelection(.enabled)` (feature iOS native, copie ciblée)
- [x] Clé secrète `Text(setup.otpauthUrl)` (`secretView`)
- [x] Chaque code de secours `Text(code)` — grille `backupCodesList` (setup)
- [x] Chaque code de secours `Text(code)` — grille `TwoFactorBackupCodesView`

### 2. `.accessibilityHidden(true)` sur glyphes héros décoratifs ≥40pt (doctrine 84i/87i)
- [x] `qrcode` 80 (secretView)
- [x] `exclamationmark.triangle` 40 (fallback QR)
- [x] `lock.shield.fill` 50 (codeEntryView)
- [x] `checkmark.shield.fill` 50 (backupCodesView)
- [x] `exclamationmark.triangle.fill` 50 (errorView)
- [x] `shield.slash.fill` 50 (TwoFactorDisableView)
- [x] `exclamationmark.triangle.fill` 40 (TwoFactorBackupCodesView erreur)
- [x] `key.fill` 40 (TwoFactorBackupCodesView succès)
- [x] `lock.shield.fill` 50 (TwoFactorBackupCodesView codeEntryStep)

### 3. VoiceOver clé secrète
- [x] `.accessibilityLabel("Clé secrète")` + `.accessibilityValue(otpauthUrl)`
      (nouvelle clé i18n `a11y_2fa_secret_key`)

## Vérification

- [x] 9/9 `.font(.system(size:))` restants = héros décoratifs figés + `accessibilityHidden`
- [x] 3 `.textSelection(.enabled)` posés
- [x] 0 changement de layout / logique / test
- [ ] CI `iOS Tests` verte
- [ ] Merge dans `main`

## Continuité (96i+)

**NE PAS re-flagger** `TwoFactorSetupView` (Dynamic Type déjà migré ; 9 héros figés
à dessein + `accessibilityHidden` posés en 95i ; codes/clé sélectionnables).

Différé prioritaire iOS 96i+ (une cible par itération, éviter les fichiers en PR
ouverte au moment du run) :
- Dynamic Type grandes surfaces : `StoryViewerView+Content` (31, ⚠️ collision i18n
  #1174), `ConversationView+Composer` (22, lot critique prudent),
  `OnboardingAnimations` (17), `ConversationView+MessageRow` (16),
  `ConversationListView+Overlays` (15), `FeedView+Attachments` (14),
  `AddParticipantSheet` (14).
- Glass adoption : `MessageOverlayMenu` (menu contextuel, 21 sites — lot dédié via
  `AdaptiveGlassContainer`, positionnement `.position()` sensible : itération isolée).
- Pattern sélection/copie : auditer d'autres surfaces affichant des identifiants /
  clés / codes non sélectionnables (précédent 95i).
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
