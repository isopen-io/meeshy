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

Run terminé 2026-07-25 (~2h50, 38 agents, 0 erreur). Verify 13/13 unités (37 checks : 22 OK/9 KO/3 PARTIAL/3 BLOCKED) ;
10 correctifs appliqués (8 haiku + 2 sonnet, 3 non-applicables justifiés) ; rebuild vert ; Reverify 11 unités.
Crash Starred Messages corrigé et re-prouvé. 3 KO résiduels attendent le déploiement gateway (export, stats, langue régionale).
Nouveaux bugs découverts (backlog) : OfflineQueue sans dispatch immédiat des PATCH prefs (perte au cold restart),
`invalidatedAt: null` vs `isSet` Prisma+MongoDB (sessions vides), `select` auth sans `bio` (profil stale), a11y Binding ProfileView.
Détail complet : `tasks/audit-settings-profile-ios-2026-07-24.md` § « Vérification visuelle E2E ».

Cycles 2-3 (2026-07-25) : workflow `backlog-4bugs-targeted` (7 agents) + passe API post-déploiement — TOUT FERMÉ EN PROD.
Outbox prefs temps réel (4/4 visuel, `resumeOrphanedPendingSyncs`), sessions (10 résultats), /auth/me avec bio, a11y 2/2,
stats 200 (forme `not:{equals:null}` validée dans le conteneur prod), clear langue `''` 200 (minLength retiré du schema Fastify + tests sur schema réel), export 110 Ko.
CI gateway reverdi (mocks user-stats alignés). Voir § « Backlog — FERMÉ » du fichier d'audit.

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

## Lot 2 — Miroir NSE + toggle « Appels entrants » (2026-07-24 soir)

- [x] D1 `callsEnabled` ajouté au modèle Swift (Codable complet) + rangée « Appels entrants » (MESSAGES) ; filtre : `.incomingCall/.incomingCallAlert/.legacyCallIncoming` → `callsEnabled` (séparé des appels manqués)
- [x] D2 Miroir App Group : `UserPreferencesManager.persist` écrit aussi `meeshy_prefs_notification` dans `group.me.meeshy.apps` (chokepoint unique : updates + applyRemote + resetCategory) ; purge au `resetSession`
- [x] D3 `NSEPreferencesGate` (NSE, réutilise le modèle SDK) : sons coupés → sans son ; badges coupés → badge 0 ; `groupNotifications` off → threadIdentifier annulé (corrige `applyThreading` qui défaisait le strip serveur) ; push off / DND / type désactivé → livraison passive (pas de bannière/son — la NSE ne peut pas supprimer sans l'entitlement filtering)
- [x] D4 pbxproj régénéré et COMMITTÉ (+22 refs, CURRENT_PROJECT_VERSION restauré 1255) — corrige aussi le build local du lot 1 (resolver absent du pbxproj committé)

## Lot 3 — Certification routage tap-notification → entité exacte (2026-07-24 nuit)

Audit 4 agents (push tap, toast/cloche, payloads gateway, destinations). Verdict avant correctifs : NON certifiable.

- [x] R1 Réel mal classé = réel SANS RAPPORT : `openReelFromNotification` gate `isReel` ; fallback `.postDetail` conserve commentId/parentCommentId
- [x] R2 Commentaire de STORY jamais ciblé : `commentId/parentCommentId` voyagent Route → Screen → Bridge → `StoryViewerRequest` → `StoryCommentsOverlayView` (scroll ciblé, latch, repli parent)
- [x] R3 Réponses : les 2 renderers (PostDetailView, FeedCommentsSheet) scrollent APRÈS l'expansion du thread (course corrigée)
- [x] R4 Highlight scopé conversation (`pendingHighlightConversationId`) + consommation à chaud (`adaptiveOnChange`, conversation déjà ouverte) + StarredMessages réparé (`.meeshyNavigateToConversation` observée par les 2 roots)
- [x] R5 iPad parité : cloche+toast → `highlightMessageId`+`ensureUnread` ; username facultatif ; `default:` route conversation/social au lieu de ~30 taps muets ; fallback `metadata.postId`
- [x] R6 Système/sécurité : tap → liste notifications (3 sites × 2 plateformes) au lieu de no-op

Limites documentées (mémoire `notification-tap-routing-map`) : commentaire > page 1 non atteint (pas d'API comments-around), reply = ancre parent (rangées de réponses sans ancre propre), missed_call sans scroll d'entrée d'appel, `context.parentCommentId` strippé par le schéma REST cloche (metadata dual-read OK), 4 dispatchs à unifier (refactor NotificationNavContext partagé).

## Lot 4 — Chasse paginée du commentaire notifié (2026-07-24 nuit)

Ferme la limite n°1 du lot 3 : un commentaire au-delà de la première page n'était jamais atteint.
Choix : PAS d'API « around » (trou dans la liste + double sémantique de curseur) — chasse paginée
BORNÉE sur le curseur existant (`CommentTargetHunter`, cap 15 pages), liste contiguë, cache cohérent.

- [x] H1 `CommentTargetHunter` (pur, `nonisolated`) + 4 tests (présent d'emblée, 3ᵉ page, cap, fin de liste)
- [x] H2 `PostDetailViewModel.loadCommentsUntilPresent` (réutilise `loadMoreComments`) + 3 tests VM (file multi-pages ajoutée à `MockPostService`)
- [x] H3 `PostDetailView` : branche d'échec du scroll → chasse (latch), échec → désarme le ciblage
- [x] H4 `FeedCommentsSheet` (posts ET réels) : suivi du `nextCursor` (ignoré jusqu'ici), `loadNextCommentsPage` (merge, jamais d'écrasement), chasse dans la branche d'échec
- [x] H5 Overlay STORY : pagination suivie (`storyCommentsNextCursor/HasMore`), `loadNextStoryCommentsPage` (append+dédup), chasse déclenchée par l'overlay via closure — les 3 surfaces couvertes

### Review (fin de run)
Commit `a866afea4` (19 fichiers, +714/−58, NON poussé — main local ahead 5 avec le travail long-press d'une autre session).
Vérifications : gateway 696 tests notif verts (30 suites) + `tsc --noEmit` clean ; SDK 38 verts ciblés (coordinator 31 dont resync badge, filtre 6, haptique 1) + 19 UserPreferencesManager dont stamp offset ; app : build complet OK + résolveur 9/9.
Chaque toggle de l'écran Notifications a désormais ≥1 consommateur réel documenté dans
`memory/reference_notification_prefs_enforcement_map.md`. Trous assumés : NSE sans accès prefs
(miroir App Group à faire), `callsEnabled` sans UI, `showPreview` non appliqué aux toasts in-app.
