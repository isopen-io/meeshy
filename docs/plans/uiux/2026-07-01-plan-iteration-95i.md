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
