# Vérification visuelle E2E — Settings & Préférences (Meeshy-iOS26) — 2026-07-24

> Suite dynamique de l'audit statique `tasks/audit-settings-profile-ios-2026-07-24.md` (18 correctifs appliqués, non commités).
> Simulateur : Meeshy-iOS26 `C295B364-8CA6-4214-BC52-E411A97EBFE2` (booted) · Backend : gate.meeshy.me (gateway local éteint) · Compte test : `apps/ios/fastlane/.env`.

## Plan

- [ ] 1. Rebuild de l'app avec les 18 correctifs (le build installé sur Meeshy-iOS26 date du 18/07, AVANT les correctifs)
- [ ] 2. Installation sur Meeshy-iOS26 (`simctl install` — préserve la session/keychain) + lancement + vérif état connecté
- [ ] 3. Workflow multi-agents `settings-e2e-visual-audit` :
  - [ ] Phase Verify — 13 unités de feature vérifiées SÉQUENTIELLEMENT (simulateur = ressource exclusive), 1 agent sonnet par unité : navigation visuelle réelle (screenshots lus), exercice de chaque contrôle, vérification de l'IMPACT SÉMANTIQUE (persistance sortie/retour + kill/relaunch, contre-vérification API si pertinent)
  - [ ] Phase Fix — chaque défaut trouvé = petit problème isolé confié au modèle le moins cher capable (haiku pour tiny/small, sonnet pour medium), groupé par fichier, séquentiel (pas de conflits)
  - [ ] Phase Rebuild — rebuild + réinstallation + relance
  - [ ] Phase Reverify — re-vérification visuelle des seules unités corrigées
- [ ] 4. Rapport final + mise à jour du fichier d'audit

## Unités vérifiées (ordre d'exécution)

| # | Unité | Points sémantiques clés (dont correctifs à re-prouver visuellement) |
|---|---|---|
| 1 | settings-hub | pickers thème/langue à effet immédiat, ouverture des sheets, logout PRÉSENT (non tapé) |
| 2 | notifications | persistance toggles, Badges persiste (#4), « Messages vocaux » ABSENT (#6) |
| 3 | privacy | toggles actifs persistent, placeholders « Bientôt » grisés non interactifs |
| 4 | media-storage | JSON/CSV exclusifs (#8), toggle Media ABSENT (#9), export aboutit (#3), clear cache |
| 5 | security | 2FA clé manuelle = base32 sans otpauth:// (#1), msg « mdp actuel incorrect » localisé (#7), sessions actives |
| 6 | account-danger | BlockedUsers OK, DeleteAccount : garde présente, JAMAIS confirmé |
| 7 | affiliate | stats + création + copie lien |
| 8 | user-stats | données réelles chargent |
| 9 | profile | clear langue régionale persiste après kill/relaunch (#5), posts chargent |
| 10 | edit-profile | save bio/displayName persiste (kill/relaunch), valeurs remises ensuite |
| 11 | voice-manage | toggle public persiste à la réouverture (#2), liste échantillons ABSENTE (#10) |
| 12 | voice-wizard | consent → étape ÂGE → recording (#11), annulation propre |
| 13 | legal-info | « Noter l'app » PRÉSENT (#13), liens OK |

## Règles de sécurité (agents)

- JAMAIS confirmer suppression de compte, JAMAIS changer réellement le mot de passe, JAMAIS activer le 2FA jusqu'au bout, JAMAIS se déconnecter sans re-login.
- Toute préférence modifiée est REMISE à sa valeur initiale après vérification.
- Toujours `--udid C295B364-8CA6-4214-BC52-E411A97EBFE2` (2 simulateurs bootés).

## Review

(à compléter en fin de run)

---

# Audit notifications point-par-point + câblage manquant — 2026-07-24 (soir)

> Demande : garantir (1) prise en compte activation/désactivation de chaque toggle Notifications,
> (2) application aux endroits adéquats, (3) persistance locale + backend.
> Constat audit (4 agents) : persistance OK partout (UserDefaults `meeshy_prefs_notification` + PATCH `/me/preferences/notification` débouncé, refetch login/foreground). Les écarts sont dans l'APPLICATION des prefs.

## Plan correctifs

### Gateway (TDD jest/bun)
- [x] A1 `shouldCreateNotification` : retirer l'early-return `type === 'system'` → le toggle `systemEnabled` devient effectif (sécurité reste hardcodée true)
- [x] A2 `isTypeEnabled` : `member_left|member_removed|member_promoted|member_demoted|member_role_changed` → `memberLeftEnabled` ; `added_to_conversation|removed_from_conversation` → `conversationEnabled` ; `community_invite` → `groupInviteEnabled` (alignement mapping iOS)
- [x] A3 e-mail immédiat haute priorité : gater les types non-sécurité sur `emailEnabled` (digest/broadcast/contact déjà gatés ; sécurité reste toujours envoyée)
- [x] A4 `PushNotificationService.sendToUser` : gating central `soundEnabled` (omettre `sound` APNs/FCM), `notificationBadgeEnabled` (badge → 0), `groupNotifications` (omettre `threadId`) — hors pushes d'appel — 696 tests notif verts + tsc clean

### SDK (TDD XCTest)
- [x] B1 `UserNotificationPreferences` : + `dndUtcOffsetMinutes: Int = 0` (Codable) ; stamp `TimeZone.current` dans `updateNotification` → le DND serveur (tz-aware) cesse d'être évalué en UTC pour les utilisateurs iOS — test stamp vert
- [x] B2 Filter : `.newConversationDirect/.newConversationGroup` → `conversationEnabled` ; `.commentReaction` → `commentLikeEnabled` ; `.storyNewComment/.friendStoryComment/.storyThreadReply` → `postCommentEnabled` ; + champ `friendContentEnabled` + mapping `.friendNewPost/.friendNewStory/.friendNewMood` — 6 tests filtre verts
- [x] B3 `NotificationCoordinator` : resync badge immédiat quand `notificationBadgeEnabled` change (publisher injectable, souscription au `start()`) — 31 tests coordinator verts
- [x] B4 `NotificationToastManager` : hook `hapticPlayer` injectable gaté sur `vibrationEnabled` — test haptic vert

### App iOS
- [x] C1 `AppDelegate.willPresent` : options dérivées des prefs via `NotificationPresentationResolver` (pur `nonisolated`, 9 tests verts) — app compile, pbxproj restauré (fichiers glob-inclus par xcodegen en CI)
- [x] C2 Haptic player câblé dans MeeshyApp (UIImpactFeedbackGenerator light) + rangée « Contenus des amis » (friendContentEnabled) dans FEED SOCIAL

### Hors périmètre (documenté, décision produit)
- `callsEnabled` (sonnerie) sans UI iOS ; miroir prefs → App Group pour la NSE ; redaction `showPreview` des toasts in-app ; nettoyage modèles morts (`NotificationPreferences` Swift, Prisma `NotificationPreference`, `PreferencesService` gateway non routé)

### Review (fin de run)
Commit `a866afea4` (19 fichiers, +714/−58, NON poussé — main local ahead 5 avec le travail long-press d'une autre session).
Vérifications : gateway 696 tests notif verts (30 suites) + `tsc --noEmit` clean ; SDK 38 verts ciblés (coordinator 31 dont resync badge, filtre 6, haptique 1) + 19 UserPreferencesManager dont stamp offset ; app : build complet OK + résolveur 9/9.
Chaque toggle de l'écran Notifications a désormais ≥1 consommateur réel documenté dans
`memory/reference_notification_prefs_enforcement_map.md`. Trous assumés : NSE sans accès prefs
(miroir App Group à faire), `callsEnabled` sans UI, `showPreview` non appliqué aux toasts in-app.
