# Plan — Iteration 87i (2026-07-01) — iOS Dynamic Type + a11y `VoiceProfileWizardView`

## Objectif
Rendre le wizard de profil vocal (`VoiceProfileWizardView`, clonage vocal — feature cœur)
conforme Dynamic Type et combler les trous VoiceOver, sans changer le layout ni la logique.

## Base de départ
`main` HEAD `7b486857` (resync avant démarrage ; branche `claude/upbeat-euler-f34cru`).
Dernière itération iOS mergée = **83i** (PR #1211, `DataStorageView`/`MediaDownloadSettingsView`).
84i/85i/86i (EditProfile/StarredMessages/AboutView) déjà sur `main`. Numéro **87i** choisi
(> 86i, plus haute analyse iOS existante) pour éviter la collision d'agents parallèles.

## Contention
Vérifié `list_pull_requests` : 1 seule PR ouverte (#1213, appels WebRTC — pas UI/UX).
`VoiceProfileWizardView` **libre** (aucune PR, différé prioritaire explicite du pointeur 85i).

## Étapes
1. [x] Explorer les surfaces iOS non prises → `VoiceProfileWizardView` (24 fixed-fonts, propre).
2. [x] Confirmer `MeeshyFont.relative` en scope (`import MeeshyUI` présent) + `common.close` en catalogue.
3. [x] Migrer 20/24 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/design préservés
   dont `.rounded`/`.monospaced`).
4. [x] Garder figés 4 sites commentés : chrome `xmark.circle.fill` 28 + 3 héros décoratifs 64/64/72.
5. [x] a11y : `.accessibilityLabel(common.close)` sur fermeture ; `.accessibilityHidden(true)` sur
   3 héros + indicateur d'étapes + glyphe consentInfoRow ; `.accessibilityElement(.combine)` sur profileInfoRow.
6. [x] Grep de contrôle : 4 `.system(size:)` restants (tous commentés), 20 `relative`.
7. [x] Rédiger analyse `2026-07-01-iteration-87i.md` + ce plan.
8. [ ] Commit + push branche ; gate = CI `ios-tests.yml` (compile Xcode 26.1 + tests simu 18.2).
9. [ ] Ouvrir PR ; merge dans `main` après CI verte ; supprimer la branche ; MàJ branch-tracking.

## Différé prioritaire iOS 88i+
Dynamic Type grandes surfaces restantes : `StoryViewerView+Content` (31, coordonner i18n),
`FeedCommentsSheet` (28 — ⚠️ historique confus : commit `429ad8b7` prétend l'avoir fait mais le
fichier a 28 fixed-fonts / 0 relative, à re-vérifier), `ConversationView+Composer` (22, lot prudent),
`DeleteAccountView` (20), `NewConversationView`/`MagicLinkView`/`DataExportView`/`AffiliateView` (17).
Puis Glass adoption reste (`MessageOverlayMenu`). **NE PAS re-flagger** `VoiceProfileWizardView` (soldé 87i).
