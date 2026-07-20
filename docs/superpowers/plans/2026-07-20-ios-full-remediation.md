# Remédiation complète iOS — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger l'app iOS de bout en bout : persistance/réponse/lacunes notifications, avatars sans bouton retry, présence 1/3/5 min sur 4 plateformes, puis lanes issues de l'audit transverse.

**Architecture:** 5 lanes à fichiers disjoints exécutées par agents parallèles en worktrees, mergées séquentiellement sur main avec review adversariale par lane avant merge. Spec : `docs/superpowers/specs/2026-07-20-ios-full-remediation-design.md` (décisions D1-D5). Ancrages fichier:ligne fournis par la reconnaissance (exacts au 2026-07-20).

**Tech Stack:** Swift/SwiftUI + GRDB (iOS), Fastify/Prisma/bun:test (gateway), TS strict (shared/web), Kotlin (Android miroir présence).

## Global Constraints

- TDD : test rouge d'abord, implémentation minimale, refactor. Tests = spec de la NOUVELLE règle, pas adaptation.
- Jamais deux lanes sur le même fichier. `project.yml` (pas pbxproj) pour tout changement de target ; ne pas régénérer sans restaurer CURRENT_PROJECT_VERSION.
- Commits fréquents sur lots cohérents VERTS ; messages `feat|fix(scope): …` ; PAS de trailer Co-Authored-By ; JAMAIS `git commit --amend`.
- Gateway/shared : suites sous **bun** (`bun run test` ciblé). Prérequis parité : `npx prisma generate --generator client` + `bun run build` dans packages/shared si schéma/types touchés.
- iOS : les agents de lane N'EXÉCUTENT PAS xcodebuild (contention disque multi-worktrees) — ils écrivent tests + code ; la vérification xcodebuild (`./apps/ios/meeshy.sh test` ciblé + build) est faite au point d'intégration après merge, avant push.
- Aucun `try?` silencieux sur chemin critique (do/catch + log). Pas de `any` TS. Immutabilité par défaut.
- Push main = déploiement : push uniquement aux jalons avec CI verte attendue ; ne JAMAIS pousser un commit docs par-dessus un run CI de code en cours.

---

## Lane GW — Gateway notifications (services/gateway + packages/shared/types)

### Task GW1 : câbler les notifications de posts (fix majeur friend_new_post/story/mood)

**Files:**
- Modify: `services/gateway/src/routes/posts/core.ts:38` (instance `new NotificationService(prisma)` nue)
- Test: `services/gateway/src/__tests__/unit/routes/posts-core-notifications.test.ts` (create)

**Étapes:**
- [ ] Test rouge : POST /posts (visibilité FRIENDS, 1 ami) → assert `fastify.notificationService.createNotification`/`pushService.sendToUser` appelé (mock l'instance décorée) ; aujourd'hui l'instance locale sans pushService fait que RIEN ne part.
- [ ] Fix : remplacer l'instance locale par `fastify.notificationService` (pattern de `comments.ts:167`, `interactions.ts:103`), garde `if` conservée (boot dégradé).
- [ ] `cd services/gateway && bun run test posts-core-notifications` → PASS ; suites posts existantes → PASS.
- [ ] Commit `fix(gateway/notifications): wire posts notifications to configured service (friend_new_post push)`

### Task GW2 : préférence friendContentEnabled

**Files:**
- Modify: `packages/shared/types/preferences/notification.ts:8-52` (schéma Zod), `services/gateway/src/services/notifications/NotificationService.ts:511-555` (isTypeEnabled)
- Test: existants NotificationService.* + cas nouveaux

**Étapes:**
- [ ] Test rouge : `friend_new_post`/`friend_new_story`/`friend_new_mood` avec `friendContentEnabled:false` → shouldCreateNotification false ; défaut (absent) → true.
- [ ] Ajouter `friendContentEnabled: z.boolean().default(true)` au schéma + mapping des 3 types dans isTypeEnabled (ne plus tomber dans `default: true`).
- [ ] `bun run build` dans packages/shared, suites vertes, commit `feat(notifications): friendContentEnabled preference gating friend content pushes`

### Task GW3 : mute par conversation appliqué au fan-out

**Files:**
- Create: `services/gateway/src/services/notifications/mutedRecipients.ts` — `filterMutedRecipients(prisma, conversationId, userIds): Promise<string[]>` (retire les isMuted)
- Modify: `services/gateway/src/services/MessageProcessor.ts:1114-1127` (fan-out new_message + replies), `services/gateway/src/services/notifications/NotificationService.ts` (createReactionNotification l.1298, createReplyNotification l.2390)
- Test: `mutedRecipients.test.ts` (create) + cas fan-out dans les suites MessageProcessor/NotificationService

**Étapes:**
- [ ] Tests rouges : destinataire isMuted exclu de new_message, reply, reaction ; MENTION perce le mute (user_mentioned non filtré) ; non-muté inchangé.
- [ ] Implémenter le helper (une requête `userConversationPreferences.findMany({ where: { conversationId, userId: { in }, isMuted: true } })`, retour liste filtrée) ; l'appeler aux 3 sites ; élargir la requête existante mentionsOnly (`OR: [{mentionsOnly:true},{isMuted:true}]`) pour économiser un round-trip dans MessageProcessor.
- [ ] Suites vertes, commit `feat(notifications): apply per-conversation mute to message/reply/reaction fan-out (mentions pierce)`

### Task GW4 : threadId + category depuis les producteurs

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts:804-861` (appel sendToUser) ; mapping type→category local au service
- Test: NotificationService.pushMessage.test.ts + collapseId tests (payload verrouillé — étendre, ne pas casser)

**Étapes:**
- [ ] Tests rouges : push new_message porte `threadId: conversationId` et `category: 'MEESHY_MESSAGE'` ; user_mentioned→MEESHY_MENTION ; message_reaction→MEESHY_MESSAGE ; post/commentaires→MEESHY_SOCIAL ; missed_call→MEESHY_CALL_MISSED ; friend_request→MEESHY_FRIEND_REQUEST.
- [ ] Implémenter le mapping (fonction pure exportée, testée) ; transport déjà prêt (l.716-722 APNs, l.510-511 FCM).
- [ ] Suites payload vertes (adapter les assertions existantes en TOUTE conscience — elles verrouillent le contrat), commit `feat(notifications): native threadId + category on push payloads`

### Task GW5 : enrichissement payload pour persistance NSE (N5)

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts:811-860` (data), `services/gateway/src/services/MessageProcessor.ts:1137` (contexte)
- Test: suites payload

**Étapes:**
- [ ] Tests rouges : data contient `createdAt` (ISO du message), `messageType` ; quand une MessageTranslation matche la langue résolue du destinataire (resolveRecipientLang déjà au fan-out), data contient `translatedContent` (tronqué 200) + `translatedLanguage` ; sinon champs absents. Payload total < 4KB assert (cas encryptedContent volumineux → traduction omise en priorité).
- [ ] Implémenter (sélection via la même résolution Prisme que le framing ; troncature avant insertion ; garde de taille).
- [ ] Suites vertes, commit `feat(notifications): push payload carries createdAt/messageType and Prism-resolved translation`

### Task GW6 : appels — callsEnabled + fallback no-voip + staleness appForeground + retry-safe

**Files:**
- Modify: `services/gateway/src/services/PushNotificationService.ts:287-329` (isPushAllowed), `services/gateway/src/services/CallEventsHandler.ts:1785-1862` (fan-out entrant), `packages/shared/types/preferences/notification.ts` (callsEnabled)
- Test: PushNotificationService.test.ts, call-push-mirroring.test.ts + nouveaux cas

**Étapes:**
- [ ] Tests rouges : (a) pushEnabled:false + push type voip/data.type call_* → ENVOYÉ si callsEnabled!==false ; callsEnabled:false → bloqué ; (b) membre sans token voip actif → fallback push alerte 'apns' type incoming_call (payload navigable .incomingCallAlert : callId, iceServers, isVideo) ; (c) socket appForeground=true mais dernier heartbeat/pong > 15 s → traité comme NON-foreground (push part quand même).
- [ ] Implémenter : early-return dédié appels dans isPushAllowed (avant le garde pushEnabled:296, DND toujours bypassé par bypassDnd existant) ; requête tokens voip par user dans le fan-out et bascule 'apns' si vide (réutiliser la construction payload du chemin CN l.1849) ; croiser appForeground avec fraîcheur socket (champ lastSeenAt du socket.data posé par les handlers heartbeat existants).
- [ ] Suites vertes, commit `feat(calls): dedicated callsEnabled pref, alert fallback when no voip token, stale-foreground guard`

### Task GW7 : pushSent + showPreview/showSenderName + DND factorisé timezone

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts` (l.721-724, l.862, isDNDActive l.561-589), `services/gateway/src/services/PushNotificationService.ts` (isPushAllowed DND), `packages/shared/` (create `utils/notification-dnd.ts` + `dndUtcOffsetMinutes` dans le schéma prefs)
- Test: unités DND partagées + suites service

**Étapes:**
- [ ] Tests rouges : pushSent=true après sendToUser avec ≥1 succès ; showPreview:false → body générique localisé (locKey), showSenderName:false → title générique ; DND 22:00-08:00 avec dndUtcOffsetMinutes=540 (Tokyo) actif à 23h heure locale, inactif à 12h locale ; parité des DEUX implémentations via le helper partagé.
- [ ] Implémenter : helper pur `isWithinDnd(prefs, nowUtc)` dans packages/shared consommé par les 2 sites ; flip pushSent dans le .then ; substitutions preview/sender.
- [ ] `bun run build` shared, suites vertes, commit `feat(notifications): honor showPreview/showSenderName, tz-aware DND (shared), track pushSent`

**Lane GW terminé →** review adversariale, puis merge.

---

## Lane P-X — Présence 1/3/5 (shared TS + web + Android + heartbeat gateway)

### Task PX1 : règle shared TS (source de vérité)

**Files:**
- Modify: `packages/shared/utils/user-presence.ts` (constantes l.34-36, garde l.73, presenceTone l.49-54, isPresenceActive l.88-95, en-tête doc l.7-22)
- Test: `packages/shared/__tests__/user-presence.test.ts` (réécrit comme spec 1/3/5)

**Étapes:**
- [ ] Tests rouges (nouvelle spec) : ≤60s→'online' ; 61-180s→'away' ; 181-300s→'idle' ; >300s→'offline' ; isOnline=true + lastActiveAt 299s→'online' ; isOnline=true + 301s→décroissance ('offline') ; NaN/absent→'offline' ; futur→'online' ; presenceTone idle→'muted' ; isPresenceActive vrai pour online/away/idle, faux offline ; isPresencePulsing online seul.
- [ ] Implémenter : `PRESENCE_ONLINE_WINDOW_MS=60_000`, `PRESENCE_AWAY_WINDOW_MS=180_000`, `PRESENCE_IDLE_WINDOW_MS=300_000` (supprimer 1_800_000) ; renommer l'état `'recent'`→`'idle'` dans le type PresenceStatus ; garde anti-stale sur IDLE_WINDOW.
- [ ] `cd packages/shared && bun run test user-presence` PASS ; `bun run build` ; tsc signale tous les consommateurs de 'recent' → les corriger fait partie des tasks suivantes de CETTE lane (web) ; commit `feat(presence)!: 1/3/5min rule — online/away/idle(grey)/offline, 5min stale guard` (avec les fixes web du même lot si nécessaires à la compile).
</br>

### Task PX2 : web — maps couleur, gating, labels, duplication

**Files:**
- Modify: `apps/web/lib/user-status.ts` (PRESENCE_DOT_CLASS/BADGE/TEXT, doc), `apps/web/components/v2/Avatar.tsx:29-34,97`, `apps/web/components/.../online-indicator.tsx`, `UserPresenceLabel.tsx`, `UserPresenceBadge.tsx`, `apps/web/services/users.service.ts:222-244` (déléguer au shared), partitions `conversation-participants(-drawer).tsx:253-265,731,760`, locales (`presence.recent`→`presence.idle` : en/fr/es/pt)
- Test: `apps/web/__tests__/.../user-status.test.ts` réécrit

**Étapes:**
- [ ] Tests rouges : dot online='bg-emerald-400 animate-pulse', away='bg-amber-400', idle='bg-gray-400', offline→composants return null ; users.service délègue à getUserPresenceStatus ; isPresenceActive partitionne online+away+idle vs offline.
- [ ] Implémenter ; en-tête section « Hors ligne » drawer : garder le libellé, retirer le dot gris d'en-tête ; libellé idle = clé i18n « Inactif »/« Inactive ».
- [ ] `bun run test` ciblé web (mocks `{virtual:true}` si besoin sous bun) ; commit `feat(web/presence): 1/3/5 rule — idle grey dot displayed, offline hidden everywhere`

### Task PX3 : Android — miroir Presence.kt

**Files:**
- Modify: `apps/android/.../Presence.kt:38-60`, `MeeshyAvatar.kt:41-45` (IDLE→gris, OFFLINE→null), en-têtes doc
- Test: `PresenceTest.kt`, `MeeshyAvatarTest.kt`, `FriendPresenceTest.kt` réécrits (bornes 60/180/300, parité parse-échec/futur)

**Étapes:**
- [ ] Tests rouges (mêmes bornes que PX1) → implémentation → `./gradlew :app:testDebugUnitTest --tests '*Presence*'` si toolchain dispo (sinon marquer VÉRIF CI) ; commit `feat(android/presence): 1/3/5 rule mirror`

### Task PX4 : heartbeat gateway lastActiveAt (corollaire garde 5 min)

**Files:**
- Modify: `services/gateway/src/socketio/handlers/...` (handler heartbeat/pong existant — repérer `call:heartbeat`/ping Socket.IO) + `services/gateway/src/services/StatusService.ts` (réutiliser le throttle Redis 5s l.182-198)
- Test: unité StatusService/handler

**Étapes:**
- [ ] Test rouge : un socket connecté qui ping (sans autre activité) rafraîchit lastActiveAt au plus toutes les 60 s (throttle) → un connecté-passif reste 'online' sous la garde 5 min.
- [ ] Implémenter : sur l'événement de ping/pong engine (`socket.conn.on('packet')` type pong, ou heartbeat applicatif existant), appeler `statusService.updateUserLastSeen(userId)` throttlé 60 s (réutiliser ensureUserOnline pattern middleware/auth.ts:291).
- [ ] Suites vertes, commit `feat(presence): refresh lastActiveAt on socket heartbeat (passive-connected stays online under 5min guard)`

**Lane P-X terminé →** review adversariale, merge (après Lane GW pour éviter le double-merge gateway simultané).

---

## Lane P-iOS — Présence iOS

### Task PI1 : PresenceModels + PresenceStyle (SDK)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/.../PresenceModels.swift:25-45` (state(now:), doc), `packages/MeeshySDK/Sources/MeeshyUI/Theme/PresenceStyle.swift` (dotColor/pulse/labels)
- Test: `UserPresenceStateTests.swift`, `PresenceStyleTests.swift` réécrits (Swift Testing, bornes 60/180/300, anti-stale 301 s, `.idle`→neutral400 affiché, `.offline` label « Hors ligne » conservé pour contextes labellisés)

**Étapes:**
- [ ] Tests rouges : renommer `case recent`→`case idle` (le compilateur liste les sites) ; state(now:) → online≤60, away≤180, idle≤300, offline au-delà ; isOnline garde ≤300 ; dotColor idle=neutral400 ; pulse online seul ; localizedLabel idle=« Inactif » (xcstrings : NOUVELLE clé, ne pas réutiliser presence.recent — union merge garde les clés mortes, tolérer).
- [ ] Implémenter + corriger TOUS les sites listés par le compilateur qui référencent `.recent` explicitement (PresenceStyle, a11y helpers, BubbleFooterModel si concerné) — sans changer les fichiers réservés à Lane AV (UserProfileSheet+Header.swift:52 interdit ; sa l.190-196 offline→textSecondary reste valide sans édit si le switch est exhaustif via default ; si le compilateur l'exige, édit MINIMAL du case seul).
- [ ] Commit `feat(ios/presence): 1/3/5 rule — idle grey state displayed, 5min stale guard`

### Task PI2 : PresenceManager cadence + fenêtres de flip

**Files:**
- Modify: `packages/MeeshySDK/.../PresenceManager.swift:83-91,139-146` (timer 60→30 s, isNearStateFlip 60-90/180-210/300-330)
- Test: `PresenceManagerTests.swift` réécrit (flips à 61 s→away, 181 s→idle, 301 s→offline ; noteActivity typing force online)

**Étapes:**
- [ ] Tests rouges → implémentation → commit `feat(ios/presence): 30s tick + flip windows aligned to 1/3/5`

### Task PI3 : affichages labellisés iOS

**Files:**
- Modify: `apps/ios/Meeshy/.../StoryViewerView.swift:1774-1798` (badge intro : offline → AUCUN badge), `UserIdentityBar` (ne plus émettre `.presence` si offline), `ContactsShared.swift:49` + labels « Vu il y a » (RelativeTimeFormatter inchangé — factuel), a11y (ContactsListTab.swift:195, ParticipantsView.swift:529-533)
- Test: `IdentityBarElementTests.swift` + tests badge story réécrits

**Étapes:**
- [ ] Tests rouges → implémentation → commit `feat(ios/presence): labeled surfaces follow 1/3/5 — no badge/element beyond 5min`

**Lane P-iOS terminé →** review adversariale ; merge ; ENSUITE Lane AV démarre (fichier partagé UserProfileSheet+Header.swift).

---

## Lane AV — Avatars/bannières sans retry (démarre après merge P-iOS)

### Task AV1 : showsRetryButton découplé + label harmonisé

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift:23,36,65-82` (nouveau param `showsRetryButton: Bool = true`, defaultValue « Réessayer »)
- Test: test unitaire de la vue (état failed + showsRetryButton:false → pas de bouton, thumbHash/placeholder rendu)

**Étapes:**
- [ ] Test rouge → implémentation (le bloc retry l.65-82 gated par `showsStatusOverlays && showsRetryButton`) → commit `feat(sdk/images): decouple retry button from status overlays`

### Task AV2 : retry silencieux borné + cache négatif (DiskCacheStore)

**Files:**
- Modify: `packages/MeeshySDK/.../DiskCacheStore.swift:293-315` (networkData)
- Test: tests unitaires du store (URLProtocol mock) : échec transitoire → 2 retries backoff → succès ; échec persistant → nil + cache négatif ~45 s (re-appel immédiat ne re-fetch PAS) ; coalescing inFlightTasks conservé

**Étapes:**
- [ ] Tests rouges → implémentation (retry borné 2, backoff 0.5s/1.5s, negative cache `[String: Date]` protégé par l'isolation existante du store, purge à l'expiration) → commit `feat(sdk/images): bounded silent retry + short negative cache in image pipeline`

### Task AV3 : câblage des 12 sites avatar/bannière

**Files:**
- Modify: bannières `UserProfileSheet+Header.swift:52`, `CommunitySettingsView.swift:246`, `ConversationSettingsView.swift:237`, `ConversationInfoSheet.swift:310`, `ConversationListHelpers.swift:276`, `CallView.swift:355` → `showsRetryButton: false` ; avatars `CallView.swift:1730,1777`, `CallParticipantVisual.swift:56`, `MeeshyVideoPlayer+Renderers.swift:586`, `StoryViewerView+Content.swift:1904` → `CachedAvatarImage` (name+accentColor du contexte) ; `NotificationRowView.swift:133` → `showsRetryButton: false`
- Test: pas de baseline snapshot connue sur ces surfaces (vérifier par grep avant ; si baselines → les régénérer dans le même commit)

**Étapes:**
- [ ] Implémenter site par site (attention : migration vers CachedAvatarImage = téléchargement non gated par MediaDownloadPolicy — acceptable avatars, documenté) → commit `fix(ios/avatars): no retry button on avatars & banners — silent fallback everywhere`

**Lane AV terminé →** review adversariale, merge.

---

## Lane N-iOS — Notifications iOS : persistance durcie + réponses (parallèle à P-iOS/AV)

### Task NI1 : busy_timeout + protection fichier (N1, N2)

**Files:**
- Modify: `apps/ios/Meeshy/.../DependencyContainer.swift:311-320` (dbConfig `busyMode: .timeout(5)`), `apps/ios/MeeshyNotificationExtension/NotificationService.swift:355-362` (Configuration du sharedPool idem), DependencyContainer.databasePath (protection `.completeUntilFirstUserAuthentication` sur sqlite + -wal/-shm, miroir AppDatabase.swift:88-109)
- Test: unité SDK sur la config si exposable ; sinon test de comportement MessagePersistenceActor sous écrivains concurrents (2 pools même fichier tmp, aucun SQLITE_BUSY)

**Étapes:**
- [ ] Test rouge concurrent → implémentation → commit `fix(ios/nse): busy_timeout on both pools + explicit file protection for shared message DB`

### Task NI2 : fix clé E2EE NSE (N3)

**Files:**
- Modify: `apps/ios/MeeshyNotificationExtension/NSEDecryptor.swift:34-53`
- Test: `MeeshyTests` unité NSEDecryptor (injectable keychain reader) : compte namespacé `{activeUserId}.me.meeshy.e2ee.session.{senderId}` prioritaire, fallback legacy, kSecAttrAccessGroup posé (pattern NSEDataSync.sharedKeychainAccessGroup l.307-327)

**Étapes:**
- [ ] Tests rouges → implémentation → commit `fix(ios/nse): read namespaced E2EE session key (restore encrypted push preview & pre-persist)`

### Task NI3 : prePersistMessage typé média (N4)

**Files:**
- Modify: `apps/ios/MeeshyNotificationExtension/NotificationService.swift:364-430`
- Test: helper pur (mimeType→messageType/contentType) dans NotificationPayloadHelpers + test

**Étapes:**
- [ ] Tests rouges (audio/mp4/image/other→text) → implémentation → commit `fix(ios/nse): pre-persisted bubble carries media type from attachment mime`

### Task NI4 : handler d'action fiable (R1) + réponse message durable (R2)

**Files:**
- Modify: `apps/ios/Meeshy/AppDelegate.swift:555-624`
- Test: MeeshyTests sur un handler extrait testable (protocol NotificationActionHandling) : (a) completionHandler appelé APRÈS la fin du travail ; (b) authToken poussé vers APIClient avant send ; (c) échec réseau → ligne outbox .sendMessage présente (pas de perte) ; (d) originalLanguage = langue préférée locale

**Étapes:**
- [ ] Extraire la logique didReceive dans `NotificationActionHandler` injectable (init avec MessageService/OfflineQueue/AuthManager protocols existants) — AppDelegate délègue.
- [ ] Tests rouges → implémentation : beginBackgroundTask/endBackgroundTask autour du Task ; `APIClient.shared.authToken = AuthManager.shared.authToken` en tête ; insertOptimistic + enqueue outbox kind .sendMessage puis REST (dédup clientMessageId) ; do/catch + log (zéro try?).
- [ ] Commit `fix(ios/notifications): reliable action handler — background task, token restore, durable outbox reply`

### Task NI5 : commenter depuis les notifs sociales (R3, R4) + threading décidé

**Files:**
- Modify: `apps/ios/Meeshy/AppDelegate.swift:264-361` (catégorie MEESHY_SOCIAL_COMMENTABLE + MEESHY_ACTION_COMMENT), `apps/ios/MeeshyNotificationExtension/NotificationService.swift:204-269` (applyCategory : types commentables avec postId → _COMMENTABLE), `packages/MeeshySDK/.../OutboxRecord.swift:21-24` + `OutboxDispatcher.swift` (kind .sendComment + X-Client-Mutation-Id), `packages/MeeshySDK/.../PostService.swift` (addComment accepte clientMutationId)
- Test: NotificationActionHandler : post_comment/comment_reply/story_new_comment/story_thread_reply → addComment(parentId: commentId notifié) ; friend_new_post → parentId nil ; anonyme → no-op loggé ; échec réseau → outbox .sendComment ; OutboxDispatcher rejoue avec le MÊME mutation id

**Étapes:**
- [ ] Tests rouges → implémentation → commit `feat(ios/notifications): inline comment action on social pushes (threaded reply, durable outbox)`

### Task NI6 : actions demande d'ami réelles (R5) + split catégorie CALL (G4d)

**Files:**
- Modify: `apps/ios/Meeshy/AppDelegate.swift` (handlers ACCEPT/DECLINE → FriendshipService REST background + markRead bannière ; catégories MEESHY_CALL_INCOMING/MEESHY_CALL_MISSED), `apps/ios/MeeshyNotificationExtension/NotificationService.swift:254-259` (mapping incoming vs missed/ended/declined)
- Test: handler : accept → API acceptFriendRequest(senderId) appelé sans navigation ; decline idem ; missed_call n'expose PAS answer (catégorie _MISSED)

**Étapes:**
- [ ] Tests rouges → implémentation → commit `fix(ios/notifications): friend request actions actually call API; split call categories (no Answer on ended calls)`

### Task NI7 : VoIP register retry (G4c) + retrait FirebaseMessaging (G7)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift:438-465` (échec POST → pendingTokenToRegister + re-tentative foreground/reconnect hors cooldown), `apps/ios/project.yml:102-103` (retirer le produit FirebaseMessaging du target Meeshy)
- Test: VoIPPushManager (mock APIClient) : échec réseau → token re-tenté au prochain trigger, succès → cooldown normal

**Étapes:**
- [ ] Tests rouges → implémentation → régénération xcodegen AU POINT D'INTÉGRATION seulement (CURRENT_PROJECT_VERSION préservé) → commit `fix(ios/push): retry voip token registration; drop unused FirebaseMessaging link`

**Lane N-iOS terminé →** review adversariale, merge.

---

## Intégration & jalons

- [ ] Merge ordre : GW → P-X → P-iOS → AV → N-iOS (reviews adversariales par lane AVANT merge ; findings CONFIRMÉS corrigés dans la lane).
- [ ] Post-merges iOS : `cd packages/shared && npx prisma generate --generator client && bun run build` ; gateway `bun run test:coverage` ; `./apps/ios/meeshy.sh test` ciblé (suites touchées) puis `./apps/ios/meeshy.sh build` ; xcodegen regen si project.yml touché (restaurer build number).
- [ ] Doc/mémoire (APRÈS CI verte du code) : CLAUDE.md section présence (1/3/5), mémoire presence, en-têtes de règle sources.
- [ ] Push main au jalon (CI = validation finale) ; surveiller le run (pas de push docs par-dessus).
- [ ] Annexe B : lanes de l'audit transverse (`ios-full-audit`) planifiées dans tasks/todo.md au fur et à mesure, mêmes règles (fichiers disjoints des lanes en cours, TDD, review, commit).
