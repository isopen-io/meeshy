# Remédiation complète app iOS — notifications, présence, avatars + audit transverse

Date : 2026-07-20 · Statut : approuvé par directive utilisateur (exécution autonome demandée)
Reconnaissance : workflow `ios-notif-recon` (8 agents) · Audit transverse : workflow `ios-full-audit` (15 agents, lanes en annexe B)

## Objectifs (directive utilisateur)

1. Les messages reçus en notification sont persistés en BDD locale de l'app.
2. Répondre depuis les notifications : message, commentaire, nouveau post (→ commentaire).
3. Combler les lacunes du système de notification : appels audio/vidéo, messages, réactions, etc.
4. Aucun bouton retry sur les avatars et bannières (fallback élégant + retry silencieux).
5. Présence : **vert < 1 min, orange < 3 min, gris < 5 min, rien au-delà** — partout.
6. Couvrir TOUS les aspects de l'application (audit transverse → lanes additionnelles).

## D1 — Présence : nouvelle règle 1/3/5 (4 plateformes)

### Sémantique retenue
| État | Fenêtre lastActiveAt | Rendu dot | Pulse | Libellé |
|---|---|---|---|---|
| `online` | ≤ 60 s (ou isOnline=true avec lastActiveAt ≤ 300 s) | vert `#34D399` | oui | « En ligne » |
| `away` | 60 s – 180 s | orange `#FBBF24` | non | « Absent » |
| `idle` (renommage de `recent`) | 180 s – 300 s | **gris `#9CA3AF` AFFICHÉ** | non | « Inactif » |
| `offline` | > 300 s ou aucune donnée | **RIEN** (aucun dot) | — | (contexte labellisé seulement) |

Décisions :
- **Renommage `recent` → `idle`** : force le compilateur/tsc à visiter chaque site explicite ; évite le drift silencieux vert→gris (4 maps couleur indépendantes).
- **Garde anti-stale isOnline recalée de 30 min → 5 min** : `isOnline===true` autoritatif (vert) tant que `lastActiveAt ≤ 300 s` ; au-delà, décroissance pure. Corollaire gateway : rafraîchir `lastActiveAt` (throttle 60 s) sur heartbeat socket pour qu'un connecté-passif reste vert (sinon il disparaîtrait à 5 min app ouverte).
- **Gating des dots inchangé dans son mécanisme** : chaque point de rendu masque `offline` ; le nouvel état `idle` gris PASSE (MeeshyAvatar.swift `guard != .offline` reste correct ; `meeshyPresenceDotColor` Android : OFFLINE→null conservé, IDLE→gris ajouté ; web OnlineIndicator/UserPresenceBadge/Avatar v2 : return null sur offline conservé).
- **Affichages labellisés** : badge story-intro >5 min → pas de badge du tout ; UserIdentityBar n'émet plus l'élément `.presence` si offline ; sections « Hors ligne » web (groupement) conservées sans dot gris d'en-tête. `isPresenceActive` = tout état ≠ offline (< 5 min).
- **Machinerie** : timer PresenceManager 60 s → 30 s ; fenêtres `isNearStateFlip` recalées (60-90/180-210/300-330 s) ; vérifier tick web.
- **9 fichiers de tests réécrits comme spec de la NOUVELLE règle** (bornes 60/61, 180/181, 300/301, anti-stale 301 s) ; conserver les cas parité NaN/parse-échec/futur.
- Résorber la duplication `apps/web/services/users.service.ts:222-244` (déléguer au shared) ; sites binaires isOnline sans lastActiveAt : vert-ou-rien accepté.
- Doc synchronisée en dernier : en-têtes de règle des 6 sources, CLAUDE.md racine, mémoire presence.

## D2 — Avatars/bannières : zéro bouton retry

- Nouveau paramètre `showsRetryButton: Bool = true` dans `CachedAsyncImage` (découplé de `showsStatusOverlays`) — les ~25 surfaces média (viewers plein écran, bulles) GARDENT leur retry (seul recours UX en plein écran).
- 6 sites bannière → `showsRetryButton: false` (placeholder gradient existant = rendu d'échec) : UserProfileSheet+Header, CommunitySettingsView, ConversationSettingsView, ConversationInfoSheet, ConversationListHelpers (preview), CallView backdrop.
- ~6 avatars ad hoc → migration `CachedAvatarImage` (échec silencieux + initiales intégrées, fournir name+accentColor) : CallView ×2, CallParticipantVisual, MeeshyVideoPlayer+Renderers chip, StoryViewerView+Content commentaire ; NotificationRowView (vignette post) → `showsRetryButton: false`.
- **Retry silencieux borné** dans `DiskCacheStore.networkData` : 2 tentatives supplémentaires, backoff exponentiel, funnel `inFlightTasks` conservé + **cache négatif court (~45 s)** anti-tempête de cellules. Placement SDK conforme (service low-level, zéro orchestration UX).
- Harmoniser `common.retry` defaultValue → « Réessayer ».
- Garde-fou : ne PAS changer le défaut de `showsStatusOverlays` ni gater CachedAvatarImage par MediaDownloadPolicy (choix documenté existant).

## D3 — Persistance des messages reçus en notification (durcissement NSE)

L'architecture existe (NSE pré-persiste dans `meeshy_messages.sqlite` App Group + prefetch REST + consommateurs au foreground). Correctifs :
- N1 `PRAGMA busy_timeout=5000` sur les DEUX pools (DependencyContainer.dbConfig + sharedPool NSE) — contention WAL inter-process actuellement silencieuse.
- N2 Protection fichier explicite `.completeUntilFirstUserAuthentication` sur meeshy_messages.sqlite (+ -wal/-shm) côté DependencyContainer (miroir d'AppDatabase) — la NSE doit pouvoir écrire téléphone verrouillé.
- N3 **Fix E2EE** : NSEDecryptor lit le compte namespacé `{activeUserId}.me.meeshy.e2ee.session.{senderId}` (activeUserId depuis UserDefaults App Group) avec fallback legacy + `kSecAttrAccessGroup` résolu dynamiquement (pattern NSEDataSync).
- N4 prePersistMessage : messageType/contentType dérivés d'attachmentMimeType (bulle pré-persistée du bon type).
- N5 (gateway) Enrichir `data` du push : `createdAt` ISO, `messageType`, et **traduction pré-résolue vers la langue du destinataire** (Prisme — resolveRecipientLang déjà appelé au fan-out) tronquée (limite APNs 4 KB). La NSE affiche et pré-persiste la traduction préférée.
- Invariant documenté : dédup NSE↔socket/REST = localId=serverId=messageId + étape PK de upsertFromAPIMessages ; MessageDatabaseMigrations reste append-only (2 process exécutent runAll).

## D4 — Répondre depuis les notifications

- R1 **Fiabiliser le handler d'action** (AppDelegate.didReceive) : envelopper dans `beginBackgroundTask`, appeler `completionHandler` à la FIN du Task ; avant tout send, pousser `AuthManager.shared.authToken` (lecture Keychain lazy) vers `APIClient.shared.authToken` (fix du 401 silencieux au cold-launch background).
- R2 **Réponse message durable** : MessageRecord optimiste + enqueue outbox kind `.sendMessage` PUIS tentative REST (dédup gateway par clientMessageId → retries sûrs) ; joindre `originalLanguage` (langue préférée locale) — cohérence Prisme.
- R3 **Commenter depuis les notifs sociales** : nouvelle catégorie `MEESHY_SOCIAL_COMMENTABLE` posée par la NSE quand le type est commentable ET postId présent ; `UNTextInputNotificationAction` MEESHY_ACTION_COMMENT ; handler → `PostService.addComment(postId:content:parentId:)` avec header `X-Client-Mutation-Id` (support gateway withMutationLog existant). **Threading décidé** : notification de commentaire/réponse (`post_comment`, `comment_reply`, `story_new_comment`, `story_thread_reply`) → `parentId = commentId` notifié (réponse threadée à CE commentaire) ; notification de nouveau post (`friend_new_post`) → commentaire racine (`parentId = nil`). Gate : registeredUser uniquement (endpoint l'exige).
- R4 Nouveau kind outbox `.sendComment` (durabilité offline + X-Client-Mutation-Id) dans OutboxDispatcher.
- R5 **Actions demande d'ami réparées** : MEESHY_ACTION_ACCEPT/DECLINE exécutent l'appel REST (FriendshipService) en background au lieu d'une navigation jamais consommée.
- R6 markRead : même fix token que R1 ; après commentaire réussi, markRead + purge bannières (parité flux message).

## D5 — Lacunes notifications (gateway + iOS)

- G1 **Fix majeur** : `routes/posts/core.ts` utilise `fastify.notificationService` (instance câblée push+socket+email) au lieu d'une instance nue → les pushes/sockets `friend_new_post`, `friend_new_story`, `friend_new_mood`, mentions de post partent enfin. + préférence `friendContentEnabled` (défaut true) pour maîtriser le burst au déploiement. + test.
- G2 **Mute appliqué** : helper partagé `filterMutedRecipients` ; fan-out new_message/replies/réactions exclut `UserConversationPreferences.isMuted` ; les MENTIONS percent le mute (convention WhatsApp).
- G3 `threadId = conversationId` (regroupement natif iOS) + `category` posés par les producteurs (le transport les propage déjà ; la NSE reste le fallback).
- G4 **Appels** : (a) préférence `callsEnabled` distincte — `pushEnabled=false` ne coupe plus les pushes d'appel (early-return dans isPushAllowed pour types voip/call_*, gouverné par callsEnabled défaut true) ; (b) fallback alerte APNs standard quand aucun token voip actif (Mac, token expiré) — réutilise le routage `.incomingCallAlert` existant ; (c) retry avec backoff sur l'échec du POST register-device-token VoIP ; (d) scinder MEESHY_CALL → `MEESHY_CALL_INCOMING` [answer, decline] / `MEESHY_CALL_MISSED` [callback, view] (plus de « Répondre » sur appel terminé) ; (e) staleness check du flag `appForeground` gateway (socket zombie → push VoIP quand même, dédup client existante par callId).
- G5 `delivery.pushSent` flippé après envoi réussi ; `showPreview`/`showSenderName` respectés (corps générique localisé si false).
- G6 DND timezone : offset utilisateur stocké dans prefs, logique DND factorisée en un site partagé (aujourd'hui dupliquée ×2 en UTC).
- G7 Retirer FirebaseMessaging du target Meeshy (linké, jamais utilisé — pur APNs).
- Différés (P3, documentés) : Live Activity appel en cours (plan écrit dans LiveActivityBridge), pushes pour anonymes, son custom time-sensitive Chine.

## Architecture d'exécution

Lanes parallélisables à fichiers DISJOINTS (règle worktrees) ; TDD systématique ; review adversariale avant chaque commit ; commits fréquents sur lots cohérents VERTS ; push main aux jalons (CI valide ; pas de commit docs par-dessus un run CI de code en cours).

- **Lane GW** (gateway + shared types) : G1→G6, N5. Tests bun.
- **Lane P-X** (présence shared TS + web + Android + heartbeat gateway StatusService — fichiers disjoints de Lane GW) : D1 hors iOS.
- **Lane P-iOS** (présence iOS) : D1 iOS. PUIS **Lane AV** (avatars, D2) — séquencées entre elles (UserProfileSheet+Header.swift partagé).
- **Lane N-iOS** (NSE + AppDelegate + Outbox + VoIP retry) : D3 (N1-N4), D4, G4(c,d), G7 — parallèle aux lanes P-iOS/AV (fichiers disjoints).
- **Lanes B-\*** (audit transverse) : définies en annexe B après synthèse du workflow `ios-full-audit`, mêmes règles.

Vérification : suites ciblées par lane (bun gateway/shared ; XCTest -only-testing iOS ; ./gradlew test Android si dispo) ; build iOS intégration (`./apps/ios/meeshy.sh build`) après merge des lanes iOS ; jamais de tâche « done » sans preuve.

## Annexe B — lanes issues de l'audit transverse

(Complétée après le workflow `ios-full-audit` — voir tasks/todo.md.)
