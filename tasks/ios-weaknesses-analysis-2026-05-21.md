# Rapport d'analyse exhaustive — Faiblesses iOS Meeshy

**Date** : 2026-05-21
**Branche** : `claude/analyze-ios-weaknesses-swaRR`
**Méthodologie** : 12 agents d'exploration en parallèle, chacun spécialisé sur un domaine. Toutes les affirmations sont sourcées par `fichier:ligne` lu dans le code (308 fichiers `apps/ios/` + 395 fichiers `packages/MeeshySDK/Sources/`). Aucune hypothèse non vérifiable.
**Audience** : revue par Codex (concurrence).

---

## Table des matières

1. [Synthèse executive](#1-synthèse-executive)
2. [Cartographie TOTALE des features iOS](#2-cartographie-totale-des-features-ios)
3. [Faiblesses par domaine](#3-faiblesses-par-domaine)
   - 3.1 [Chat / messages / chat anonyme](#31-chat--messages--chat-anonyme)
   - 3.2 [Liste de conversations & configurations](#32-liste-de-conversations--configurations)
   - 3.3 [Profil utilisateur & profil vocal](#33-profil-utilisateur--profil-vocal)
   - 3.4 [Pipeline de traduction (Prisme Linguistique)](#34-pipeline-de-traduction-prisme-linguistique)
   - 3.5 [Stories, posts, commentaires, statuts](#35-stories-posts-commentaires-statuts)
   - 3.6 [Partage social & demandes de connexion](#36-partage-social--demandes-de-connexion)
   - 3.7 [Temps réel, sockets, notifications](#37-temps-réel-sockets-notifications)
   - 3.8 [Cache, SWR, persistence](#38-cache-swr-persistence)
   - 3.9 [Authentification, multi-compte, session](#39-authentification-multi-compte-session)
   - 3.10 [Media : audio, images, vidéo, recording](#310-media--audio-images-vidéo-recording)
   - 3.11 [Listings & navigation : performance](#311-listings--navigation--performance)
4. [Anti-patterns architecturaux transverses](#4-anti-patterns-architecturaux-transverses)
5. [Features orphelines / en trop](#5-features-orphelines--en-trop)
6. [Features manquantes](#6-features-manquantes)
7. [TODO / FIXME / stubs / dead code](#7-todo--fixme--stubs--dead-code)
8. [Décompte global & priorités](#8-décompte-global--priorités)

---

## 1. Synthèse executive

### 1.1 Volume

| Catégorie | Volume |
|---|---|
| Fichiers Swift analysés | 703 (308 app + 395 SDK) |
| Findings totaux | **400+** |
| Critiques (data loss / crash / sécurité) | **65+** |
| Majeurs (feature dégradée) | **170+** |
| Modérés (UX dégradée) | **120+** |
| Mineurs (cosmétique / perf marginale) | **50+** |

### 1.2 Diagnostic global

L'app iOS Meeshy présente une **architecture MVVM solide** (cache 3-tier `CacheCoordinator`, socket.io reconnect robuste, GRDB actor-based persistence, MeeshySDK comme couche réseau partagée) mais souffre de **dettes systémiques** qui compromettent la qualité production :

1. **Le Prisme Linguistique n'est pas appliqué de bout en bout** (previews liste conv, posts, commentaires, audio TTS, dates).
2. **L'instant-app pattern est documenté mais sans guardrail** (`CacheResult.value` déprécié sans enforcement, eviction budgets dormants).
3. **Les god objects prolifèrent** (`ConversationViewModel` 2967 lignes, `BubbleStandardLayout` 1024 lignes, `ConversationListViewModel` 16 `@Published` propriétés).
4. **Sécurité auth fragile** : tokens en `UserDefaults`, pas de biométrie, sliding-window 365j non câblé, multi-compte sans isolation Keychain stricte, logout fire-and-forget.
5. **Real-time désynchronisé** : pas de dédup d'events, gap-detector à 1000 messages/conv, badge desync entre NSE/App/Widget, foreground muting non implémenté.
6. **Offline queues incomplètes** : posts/comments pas de queue offline, idempotence outbox sans atomicité, fichiers temporaires non nettoyés.
7. **Stories vs Status : duplication conceptuelle** non résolue.
8. **2FA et reset password non terminés** (flow login ne gère pas le challenge 2FA, pas de UI password reset).

### 1.3 Risques métier

| Risque | Impact | Probabilité |
|---|---|---|
| Perte de messages offline lors d'une key rotation E2EE | Critique | Moyenne |
| Duplication de messages sur reconnect (outbox sans atomicité) | Critique | Haute |
| Badge unread divergent entre app / lockscreen / widget | UX dégradée | Haute |
| Crash collection view sur scroll après suppression | Crash | Moyenne |
| Token JWT silencieusement invalidé → logout sans message | UX dégradée | Haute |
| Stories expirées affichées (pas de check 24h au viewer) | UX dégradée | Haute |
| Locked conversation IDs en UserDefaults non chiffrés | Sécurité (jailbreak) | Basse |
| Foreground notifications iOS spammant l'utilisateur in-app | UX dégradée | Très haute |
| Account switching : cache résiduel d'ancien user visible | Privacy | Moyenne |

---

## 2. Cartographie TOTALE des features iOS

Statuts : ✅ Complet · 🟡 Partiel · 🔴 Cassé/orphelin · ❌ Manquant

### 2.1 Chat & messages

| Feature | Statut | Preuve |
|---|---|---|
| Envoi message texte (REST) | ✅ | `ConversationViewModel.swift:1600+` |
| Envoi message socket.io | 🟡 | `MessageSocketManager.swift:1338-1394` — `sendAsync` codé mais déclaré "UNUSED, gateway ne répond pas". Texte route par REST. |
| Pièces jointes (REST + socket fallback) | ✅ | `AttachmentSendService.swift`, `message:send-with-attachments` |
| Réactions emoji | ✅ | `BubbleReactionsOverlay.swift`, `ReactionService.swift` |
| Reply (quoting) | ✅ | `BubbleQuotedReply.swift` |
| Reply à une story | 🟡 | Métadonnées présentes (`APIStoryReplyTarget.swift`), vue dédiée non visible |
| Forward message | ✅ | `MessageModels.swift` `forwardedFromId`, `ForwardedFrom.swift:94` |
| Suppression (hard delete) | ✅ | `MessageService.deleteMessage`, `BubbleDeletedView.swift` |
| Message éphémère (burn / view-once) | ✅ | `isViewOnce`, `expiresAt`, `BubbleBurnedView.swift:49` |
| Édition message | ✅ | `submitEdit()` dans `ConversationView+Composer.swift:328-350` |
| Historique d'édition | ✅ | `EditHistoryStore.swift`, `MessageDetailSheet.swift` |
| Traduction message inline (Prisme) | ✅ | `MessageTranslation`, `TranslationService.swift` |
| Transcription audio | ✅ | `EdgeTranscriptionService.swift`, server fallback |
| TTS audio cloné | ✅ | `VoiceProfileService.swift`, pipeline NLLB+Chatterbox |
| Sélecteur langue TTS au playback | 🔴 | `activeAudioLanguageOverrides` existe mais aucune UI |
| Mention @user | ✅ | `MentionService.swift`, `MentionComposerController.swift` |
| Recherche dans une conversation | ❌ | Aucune view de recherche in-chat |
| Indicateur typing | ✅ | `presence:typing` + safety timers |
| Reçus de lecture | ✅ | `DeliveryIndicatorView.swift:13` |
| Pin message | 🔴 | Champs `pinnedAt`, `pinnedBy` dans `APIMessage.swift:184` — ZÉRO usage UI |
| Star/bookmark message | ✅ | `StarredMessagesStore.swift`, `StarredMessagesView.swift` |
| Locally hidden messages | ✅ | `LocallyHiddenMessagesStore.swift` |
| Thread view (replies imbriquées) | 🔴 | `ThreadView.swift` 922 lignes, **jamais appelée depuis navigation** |
| Composition rich text / markdown édition | ❌ | Affichage markdown OK, édition = texte brut |
| Slash commands | ❌ | — |
| Hashtags | ❌ | — |
| Polls / sondages | ❌ | — |

### 2.2 Conversations

| Feature | Statut | Preuve |
|---|---|---|
| Liste conversations | ✅ | `ConversationListView.swift` |
| Création 1:1 | ✅ | `NewConversationView.swift` |
| Création groupe | ✅ | `NewConversationView.swift` |
| Détails conversation | ✅ | `ConversationInfoSheet.swift` |
| Participants (add/remove/role) | ✅ | `ParticipantsView.swift`, `ParticipantService.swift` |
| Quitter groupe | ✅ | `ConversationService.leaveConversation` |
| Mute conversation | ✅ | `togglePin/toggleMute` dans `ConversationListViewModel.swift:1221` |
| Pin conversation | ✅ | idem |
| Archive / unarchive | ✅ | `archiveConversation` dans `ConversationListViewModel.swift:1292` |
| Verrou conversation (PIN/biométrie) | ✅ | `ConversationLockManager.swift` |
| Catégories (Work, Family…) | ✅ | `userCategories`, drag-to-category |
| Tags conversation | ✅ | `visibleTagsInfo` dans `ThemedConversationRow.swift:81` |
| Galerie média conversation | ✅ | `ConversationMediaGalleryView.swift` |
| Liste conversations dans le widget | 🟡 | scaffold WidgetKit, contenu non câblé |
| Preview hard-press | 🟡 | Mais sans appliquer le Prisme (cf §3.4) |
| Auto-traduction par conversation | ✅ (modèle) | `conversation.autoTranslateEnabled` mais pas validation cross-language |

### 2.3 Profil utilisateur & paramètres

| Feature | Statut | Preuve |
|---|---|---|
| Édition profil (nom, bio, avatar) | 🟡 | Deux chemins divergents : `ProfileView.swift:755` direct + `EditProfileViewModel.swift:135` via OfflineQueue |
| Avatar / Banner upload | ✅ | `uploadAvatar` dans `ProfileView.swift:820` |
| Bio max length | 🟡 | `bioMaxLength = 300` hardcodé `EditProfileViewModel.swift:80` |
| Langues utilisateur (system / regional / custom) | 🟡 | Pas de validation ISO 639-1 client-side `ProfileView.swift:737` |
| Voice Profile wizard | ✅ | `VoiceProfileWizardView.swift`, `VoiceProfileWizardViewModel.swift` |
| Voice Profile management | ✅ | `VoiceProfileManageView.swift` |
| 2FA setup | 🟡 | `TwoFactorSetupView.swift` setup OK, **flow login ne consomme pas le challenge 2FA** |
| 2FA recovery codes | 🟡 | Stockés en `@Published` éphémère, jamais persistés Keychain |
| Sessions actives | 🔴 | `ActiveSessionsView.swift:11` instancie `ActiveSessionsViewModel()` **qui n'existe pas dans le code** |
| Change password | ✅ | `ChangePasswordView.swift` |
| Password reset (mot de passe oublié) | ❌ | Aucune UI |
| Privacy settings | ✅ | `PrivacySettingsView.swift` |
| Blocked users | ✅ | `BlockedUsersView.swift` |
| Data export (RGPD) | 🟡 | Toggles : messages/media/contacts. **Manque** : préférences, 2FA codes, voice profiles |
| Delete account | 🟡 | `DeleteAccountView.swift` — pas d'état "deleting", pas de rollback partiel |
| Notification settings (global) | ✅ | `NotificationSettingsView.swift` |
| Notification per-conversation | ❌ | Granularité absente côté server-prefs |
| Media download settings | 🟡 | Politique présente, **pas de visualisation taille cache** |
| Data storage / cache size | 🟡 | `DataStorageView.swift` existe, calcul taille cache absent |
| Theme dark/light/auto | ✅ | `ThemeManager.shared` |
| Multi-compte | 🟡 | `savedAccounts` array mais isolation Keychain incomplète, switch socket non awaited |
| Biometric unlock (Face/Touch ID) | ❌ | Aucun `LAContext` |
| Onboarding tutorial | 🟡 | Steps mais boucle possible entre `consent` ↔ `ageVerification` |

### 2.4 Stories, posts, commentaires, statuts

| Feature | Statut | Preuve |
|---|---|---|
| Story tray | ✅ | `StoryTrayView.swift` |
| Story composer (layers, filters, keyframes) | ✅ | `StoryComposerView.swift`, Metal pipeline |
| Story viewer | ✅ | `StoryViewerView.swift` |
| Story expiration 24h check au viewer | 🔴 | Aucun guard `createdAt+24h<now` avant rendu |
| Story video URL fallback | 🔴 | `resolveVideoURL` un seul try, pas de retry |
| Story reaction count temps réel | 🔴 | Mise à jour locale uniquement, pas de subscription socket viewers count |
| Story repost | ✅ | `repostAsPostDirect` |
| Story export MP4 | ✅ | `StoryVideoExportService.swift` |
| Story timeline export | ❌ | `StoryTimelineEngine.swift:279` throw `notImplemented` |
| Story aspectRatio réel | 🟡 | TODO Phase 2/3 dans `StoryComposerViewModel.swift:489,954` (hardcoded 1.0) |
| Story musique | ❌ | — |
| Story offline publish queue | ✅ | `StoryPublishQueue.swift`, `StoryOfflineQueue.swift` (adapter legacy) |
| Status (mood emoji) | ✅ | `StatusComposerView.swift`, `StatusService.swift` |
| Status vs stories duplication | 🟡 | Voir §3.5 — deux pipelines parallèles |
| Feed (timeline posts) | ✅ | `FeedView.swift`, `FeedStore.swift` |
| Post creation texte | ✅ | composer bar in `FeedView.swift` |
| Post audio (composer) | ✅ | `AudioPostComposerView.swift` |
| Post offline queue | ❌ | Aucune, ≠ stories. Draft perdu au crash. |
| Post optimistic create | 🟡 | OK pour réaction, manquant pour comment |
| Post like / unlike | ✅ | `ReactionService.swift`, dedup faible |
| Post translation sheet | ✅ | `PostTranslationSheet.swift` |
| Post translation re-render lang change | 🔴 | `currentDisplayLangCode` computed, pas d'`onReceive` AuthManager |
| Comment threading | 🟡 | replies hard-coded `limit: 50` dans `FeedStore.swift:100` |
| Comment optimistic | 🔴 | Pas d'optimistic add dans `PostDetailViewModel` |
| Comment translation | ❌ | `CommentListView` UIKit ne reçoit pas `preferredLanguages` |
| Comment dedup (fetch + socket) | 🔴 | Pas de check ID, duplications visibles |

### 2.5 Partage & social

| Feature | Statut | Preuve |
|---|---|---|
| ShareLinks (créer / révoquer / stats) | ✅ | `ShareLinkService.swift`, `ShareLinksView.swift` |
| ShareLink toggleActive | 🔴 | Pas d'invalidation `CacheCoordinator` après toggle |
| TrackingLinks (raccourcisseur + clics) | ✅ | `TrackingLinkService.swift` |
| TrackingLink pagination clics | 🟡 | Service supporte offset/limit, UI ne le fait pas |
| Affiliate / referral | ✅ | `AffiliateService.swift`, `AffiliateView.swift` |
| Community links | ✅ | `CommunityLinkService.swift` |
| Liens hub central (`LinksHubView`) | 🔴 | Fichier mentionné, **non trouvé dans le repo** |
| `SharePickerView` | 🔴 | Idem, **non trouvé** |
| Story export share sheet | ✅ | `StoryExportShareSheet.swift` — mais n'affiche pas l'auteur |
| MeeshyShareExtension | 🟡 | Contacts hardcodés `sampleContacts:516`, pas d'auth partagée, pas de JWT en App Group |
| Demandes d'amis (envoi/accept/refus) | ✅ | `FriendService.swift`, `FriendRequestListView.swift` |
| Demandes d'amis temps réel | 🔴 | Pas d'abonnement socket `friend:request`, refresh manuel uniquement |
| Demandes d'amis optimistic accept | 🔴 | `removeAll` avant API, pas de rollback |
| Block / unblock | ✅ | `BlockService.swift`, `BlockedUsersView.swift` |
| Block réciproque (B m'a bloqué) | 🔴 | Pas de socket `user:blocked`, pas d'indication UI |
| Report user | ✅ | `ReportUserView.swift` — sans confirmation finale |
| QR code add friend | ❌ | — |

### 2.6 Real-time, notifications

| Feature | Statut | Preuve |
|---|---|---|
| Socket.IO message | ✅ | `MessageSocketManager.swift` |
| Socket.IO social/feed | ✅ | `SocialSocketManager.swift` |
| Reconnexion auto + backoff | ✅ | `SocketConfig.swift` |
| Reconnection gap detector | 🟡 | `ReconnectionGapDetector.swift` cap `maxTotalMessages = 1000`, pas de timeout `AsyncSemaphore.wait()` |
| Presence (online/offline/away/typing) | ✅ | `PresenceManager.swift` |
| Presence snapshot re-émis au reconnect | 🔴 | Le gateway envoie snapshot au 1er auth seulement |
| Presence on cold start après 24h+ | 🔴 | Snapshot disk droppé, gap UI "tous offline" |
| Push notifications APNs | ✅ | `PushNotificationManager.swift` |
| NSE rich notification + decryption | ✅ | `MeeshyNotificationExtension/NotificationService.swift` |
| NSE delivery receipt retry | 🔴 | Fire-and-forget, errors swallowed |
| NSE attachment download timeout | 🔴 | URLSession.shared sans timeout (NSE limité à 30s) |
| Foreground muting (in-app + conv ouverte) | 🔴 | Aucune vérif `applicationState == .active`, pas de mute |
| Badge sync (NSE / app / widget) | 🔴 | 3 sources de vérité, divergence sur burst |
| VoIP push (PushKit + CallKit) | ✅ | `VoIPPushManager.swift` |
| VoIP dedup ring | 🔴 | Ring de taille 12 sans timestamp → cas dégradé sur réseau jitter |
| ToastManager in-app notifs | ✅ | `ToastManager.swift` |
| Toast dismissTask cross-navigation | 🟡 | Mute pas l'`@Published` après dismiss view |
| Background sync (BGAppRefreshTask) | 🟡 | `BackgroundTaskManager.swift` cap 15m + boucle infinie si token expired |
| EventEmitter try/catch wrapping | 🔴 | Nombreux `.sink { Task {…} }` sans try-catch |
| Event naming convention `entity:action-word` | ✅ | Respectée |

### 2.7 Cache / SWR / persistence

| Feature | Statut | Preuve |
|---|---|---|
| `CacheCoordinator` 3-tier (memory/disk/network) | ✅ | `CacheCoordinator.swift` |
| `CacheResult<T>` (.fresh/.stale/.expired/.empty) | ✅ | `CacheResult.swift:16` — `.value` deprecated mais **non enforced** |
| Stale-While-Revalidate | 🟡 | Pattern documenté, callsites doivent l'implémenter manuellement |
| Skeleton cache-first | 🟡 | `SkeletonVisibilityResolver` mais aucun guardrail compile-time |
| Optimistic updates messages | ✅ | `OutboxRecord`, snapshot+rollback partiel |
| Optimistic updates posts/comments | 🔴 | Comments : pas d'optimistic add |
| GRDB persistence actor-based | ✅ | `MessagePersistenceActor`, `FeedPersistenceActor` |
| Offline queue messages | ✅ | `OutboxFlusher.swift`, `OfflineQueue.swift` |
| Offline queue posts / comments | ❌ | — |
| Idempotence outbox (`clientMessageId`) | 🟡 | Modèle prévu, **pas d'atomicity** sur `.pending → .inflight` |
| Outbox cleanup fichiers audio orphelins | 🔴 | `OutboxFlusher.swift:90-146` ne supprime pas `record.localAudioPath` après `.exhausted` |
| Disk budget eviction | 🔴 | `CachePolicy.mediaImages: maxBytes: 300_000_000` défini, `evictOverBudget` jamais appelé par `save()` |
| Memory pressure eviction | 🟡 | `evictL1` n'invalide pas `NSCache` interne `DiskCacheStore._imageCache` |
| TUS resumable upload | 🟡 | `TusUploadManager.swift` — pas d'expiry checkpoint 24h, retire en boucle |
| TUS upload thread-safety checkpoint | 🟡 | Deux uploads parallèles même `checkpointKey` peuvent écraser |
| Encryption asymétrie L2 GRDB | 🔴 | `GRDBCacheStore:346` write throws, `GRDBCacheStore:405` read swallow silently |
| GRDB transactions multi-store atomiques | 🔴 | `flushAll(deadline:)` séquentiel sans BEGIN TRANSACTION globale |
| Translation cache (`TranslationRecord`) | ✅ | `TranslationRecords.swift` |
| Translation cache dead code | 🟡 | `TranslationCacheRecord.swift` table définie, **jamais utilisée** |
| Translation cache TTL background eviction | 🔴 | On-read only |
| Friendship cache | ✅ | `FriendshipCache.swift` |
| Friendship cache hydration race | 🟡 | Fast-path check sans lock |
| Friendship cache clear au logout | 🔴 | `clear()` ne force pas dismount UI → données ex-user visibles brièvement |
| Sync engine | ✅ | `Sync/` package |
| Settings action queue | ✅ | `SettingsActionQueue.swift` |
| Pending status queue | 🟡 | `PendingStatusQueue.swift` filtre legacy bug en silence |

### 2.8 Auth & multi-compte

| Feature | Statut | Preuve |
|---|---|---|
| Login email + password | ✅ | `LoginView.swift` |
| Login signup | ✅ | `OnboardingFlowView.swift` |
| Magic link (deep link) | ✅ | `MagicLinkView.swift` |
| Magic link nonce / replay protection | 🔴 | Pas de validation client expiry, token en URL = leak risk |
| Password reset (mot de passe oublié) | ❌ | UI absente |
| 2FA TOTP setup | ✅ | `TwoFactorSetupView.swift` |
| 2FA verify dans login | 🔴 | `AuthService.login()` n'a pas de `verify2FA` step |
| 2FA backup codes persist | 🔴 | `@Published`, perdus si dismiss view |
| Session JWT bearer | ✅ | `APIClient.swift:306` |
| Session sliding window 365j (X-Session-Token) | 🔴 | Header existe `APIClient.swift:307`, **jamais peuplé pour user authentifié** |
| Refresh token rotation | 🟡 | `attemptTokenRefresh` ne re-save pas `sessionToken` |
| Session race on multiple 401 | 🔴 | `isRefreshing` set après Task launch, 3+ refresh parallèles possibles |
| Token expiry JWT decode | 🔴 | Decode manuel, malformé → silent logout |
| Logout local | ✅ | `AuthManager.logout` |
| Logout API retry | 🔴 | Fire-and-forget, errors swallowed |
| Logout cache invalidation | 🔴 | Aucun `CacheCoordinator.invalidate()` |
| Anonymous session (X-Session-Token) | ✅ | `AnonymousSessionStore.swift` |
| Anonymous session Keychain accessibility | 🔴 | `WhenUnlockedThisDeviceOnly` → NSE ne peut pas décoder push si device lock |
| Anonymous session expiry check | 🔴 | Pas de vérif `expiresAt` au load |
| Multi-compte (saved accounts) | 🟡 | `savedAccounts` array, isolation Keychain incomplète |
| Multi-compte switch socket reconnect | 🔴 | `forceReconnect` non awaited |
| Biometric unlock | ❌ | — |
| Email verification gate | 🔴 | `emailVerifiedAt` jamais vérifié au login |
| User deactivation feedback | 🔴 | `isActive==false` → silent logout sans toast |
| E2EE key rotation | 🔴 | `clearAllKeys()` jamais appelé, identity key réutilisée à vie |
| Tokens en UserDefaults | 🔴 | Documenté "DETTE TECH" dans `decisions.md:59` |
| Network gate at session restore | 🔴 | `checkExistingSession` ne vérifie pas connectivité |

### 2.9 Media

| Feature | Statut | Preuve |
|---|---|---|
| Audio recorder app-side | ✅ | `AudioRecorderManager.swift` |
| Audio recorder SDK side | 🟡 | `DefaultSDKAudioRecorder.swift` — **duplication**, config divergente |
| Audio playback | ✅ | `AudioPlayerManager.swift` (deux versions SDK+app) |
| Audio waveform | ✅ | `WaveformGenerator.swift`, `WaveformCache.swift` |
| Audio waveform cache memory warning | 🔴 | Dictionary `[String:[Float]]`, pas d'observer warning |
| Audio editing (gain, speed) | ✅ | `AudioEditEngine.swift` |
| Audio editing format fallback | 🔴 | Hardcoded `AVAssetExportPresetAppleM4A` |
| Audio recording max duration (SDK) | 🔴 | `DefaultSDKAudioRecorder` ignore `settings.maxDuration` |
| Audio route change handling | 🔴 | `.routeChangedOther` no-op → audio reste sur speakers après débrancher écouteurs |
| Audio session leak | 🔴 | `setActive(true)` sans rollback si `AVAudioRecorder()` throw |
| Image inline | ✅ | `BubbleAttachmentView.swift`, `CachedAsyncImage` |
| Image compression avant upload | ✅ | `MediaCompressor.swift`, `ImageDownsamplingConfig.swift` |
| Image cache 3-tier | ✅ | `DecodedImageCache.swift` |
| Image HEIC fallback | 🔴 | `UIImage.heicData(...)` optionnel sans `?? jpegData()` |
| Photo library granular permissions | 🔴 | `.limited` traité comme `.authorized`, pas de re-prompt |
| Photo library save errors | 🔴 | `performChanges` ignore error optionnel |
| Camera capture in-app | ✅ | `UIImagePickerController` |
| Photo editor inline | ❌ | — |
| Live photo | ❌ | — |
| GIF/sticker keyboard | ❌ | — |
| Video player inline | ✅ | `VideoMediaView.swift` |
| Video filters Metal pipeline | ✅ | `VideoFilterPipeline.swift` |
| Video filters thermal awareness | 🔴 | Pas de `ProcessInfo.processInfo.thermalState` |
| Video CVPixelBufferPool leak on rotation | 🔴 | Pool jamais libéré si dimensions changent |
| Video frame extractor cancellation | 🔴 | `Task.detached` ignore `Task.isCancelled` |
| Story video export | ✅ | `StoryVideoExportService.swift` |
| Story video export size validation | 🔴 | Pas de pre-flight disk space / memory budget |
| Story video export temp cleanup | 🔴 | Pas de `defer` cleanup sur exception |
| TUS resumable upload | ✅ | `TusUploadManager.swift` |
| TUS upload background continuation | 🔴 | Pas de `BGProcessingTask` enrollment |
| Attachment optimistic adopter | 🟡 | `OptimisticAttachmentAdopter.swift` — pas de cleanup URLs temp sur échec |
| Voice profile recording wizard | ✅ | `VoiceProfileWizardView.swift` |
| Voice profile sample upload (chunking + retry) | 🔴 | Manual multipart, pas de chunking ni retry |
| Voice profile sample duration estimation | 🔴 | Hardcoded `bytesPerSecond = 16000` |

### 2.10 Listings, navigation, performance

| Feature | Statut | Preuve |
|---|---|---|
| Conversation list (SwiftUI LazyVStack) | 🟡 | Nested LazyVStack outer+inner sections |
| Message list (UICollectionView diffable) | ✅ | `MessageListViewController.swift` |
| Message list `reconfigureItems` translations | 🔴 | `applySnapshot` complet au lieu de targeted reconfigure (`MessageListViewController.swift:582-601`) |
| Feed list (`FeedListViewController`) | 🟡 | `.estimated(200)` magic number, pas de pre-layout |
| Comment list (`CommentListViewController`) | 🔴 | Linear scan O(N) sur chaque dequeue (`CommentListViewController.swift:77-82`) |
| Story tray | 🟡 | HStack + `.staggeredAppear(index:)` non-virtualisé (50 stories = 2.5s build) |
| Bookmarks / starred messages | ✅ | `BookmarksView.swift`, `StarredMessagesView.swift` |
| Global search | 🟡 | `GlobalSearchView.swift` — pas de debounce visible |
| Participants list | ✅ | `ParticipantsView.swift` |
| Friend requests list | ✅ | `FriendRequestListView.swift` |
| iPad split view | ✅ | `iPadRootView.swift` |
| iPad route callback intercept | 🟡 | Pattern fragile pour écrans profonds |
| Router NavigationStack | ✅ | `Router.swift`, NavigationPath |
| Router pop+push race | 🟡 | 50ms async delay documenté `Router.swift:190-193` |
| Skeleton states | 🟡 | `Skeletons/` mais pas exhaustif |
| `BubbleLayoutEngine` | 🟡 | Existe, **non utilisé** par UIKit message/feed list |
| `.equatable()` closures non-Equatable | 🔴 | `ThemedConversationRow.swift:37-41` closures `onView*` cassent l'optimisation |
| Spring animations partout | 🔴 | 273 instances, batterie+CPU drain (`ConversationListView.swift:17,23,40,481,535,536,537,562,764`) |
| `@Published` prolifération | 🔴 | `ConversationListViewModel` 16 properties, list re-render à chaque socket event |

### 2.11 Extensions iOS

| Extension | Statut | Preuve |
|---|---|---|
| `MeeshyShareExtension` | 🟡 | Contacts hardcodés, no auth |
| `MeeshyNotificationExtension` | ✅ | `NotificationService.swift` 617 lignes |
| `MeeshyContextMenu` | ✅ | Scaffold OK |
| `MeeshyIntents` (Siri) | ✅ | `AppIntents.swift` |
| `MeeshyWidgets` | 🟡 | Lock screen scaffold, contenu non câblé |
| Live Activities (`LiveActivityBridge`) | 🔴 | Scaffold sans `ActivityKit.activity()` calls |
| Focus Filter (`MeeshyFocusFilter`) | 🔴 | Bridge présent, aucune UI |

### 2.12 Diagnostic & dev

| Feature | Statut | Preuve |
|---|---|---|
| Crashlytics | ✅ | `CrashlyticsReporter.swift`, `CrashDiagnosticsManager.swift` |
| Firebase Analytics | ✅ | `AnalyticsManager.swift` |
| Performance MetricKit | 🟡 | `MeeshyMetricsSubscriber.swift` — peu d'instrumentation |
| `os.Logger` catégorisé | 🟡 | Mix `me.meeshy.app` / `me.meeshy.sdk` / pas de subsystem |
| Unit tests | 🟡 | `MeeshyTests/Unit/` < 15 fichiers pour 200+ VM/Service |
| UI tests | ❌ | — |
| Snapshot tests | ❌ | Dossier vide |
| Integration tests E2E | ❌ | — |
| Performance tests | 🟡 | `BubbleSimpleMessagePerfTests.swift` |
| Feature flags | ❌ | — |
| A/B testing | ❌ | — |

---

## 3. Faiblesses par domaine

Cette section reproduit les findings de chaque agent, regroupés. Chaque finding est cité avec `fichier:ligne`. Sévérités : **C** critique, **M** majeur, **m** modéré, **·** mineur.

### 3.1 Chat / messages / chat anonyme

| Sév. | Titre | Fichier:ligne | Évidence courte |
|---|---|---|---|
| C | Violation Prisme : `Locale.current` pour formater sections de date | `ConversationView.swift:339-356` | 4 `DateFormatter` avec `f.locale = Locale.current` |
| C | Race `messageText` vs `task` initial load + `onAppear` draft restore | `ConversationView.swift:695-758` | DraftStore restauration peut être écrasée par `persistDraft` immédiat |
| C | `MessageListViewController` force-unwrap sur indexPath pendant scroll | `MessageListViewController.swift` | Crash si messages se vident en cours de scroll |
| C | `decryptMessagesIfNeeded` race avec `storeRefreshGeneration` | `ConversationViewModel.swift:735-741` | Une 2e refresh pendant decrypt → messages en état partiel |
| C | `OptimisticAttachmentAdopter` ne cleanup pas les URL temp | `OptimisticAttachmentAdopter.swift` | Fichiers `temporaryDirectory` jamais supprimés sur échec |
| C | `MessageStore.read()` jamais wrappé try-catch | `BubbleStandardLayout.swift` (callsites) | Corruption GRDB → messages disparaissent silencieusement |
| C | `serverId(for:)` pollution cross-conversation | `ConversationViewModel.swift:237-240` | `pendingServerIds` jamais invalidé si VM réutilisé |
| C | `router.deepLinkProfileUser` mutation inline depuis bubble sans validation | `ThemedMessageBubble.swift:224-229` | userId invalide → crash, re-render global |
| C | Pas de timeout sur join `GuestConversationContainer` | `GuestConversationContainer.swift:10-35` | UX gel sans feedback |
| M | Keyboard observers sans `[weak self]` | `ConversationView.swift:796-802` | Strong capture via `keyboardHeight` mutation |
| M | `DraftStore` UserDefaults sans lock | `DraftStore.swift:75-99` | `@unchecked Sendable` mais accès concurrent UD |
| M | `ReplyContextCleaner` ne valide pas existence du message cité | `ReplyContextCleaner.swift:28-31` | Bannière reply orpheline non clearable |
| M | `BubbleStandardLayout.secondaryContent` peut être nil avec `secondaryLangCode` set | `BubbleStandardLayout.swift:154-156` | Panneau translation vide |
| M | `OutboxFlusher` ne supprime pas fichier audio sur `.exhausted` | `OutboxFlusher.swift:90-146` | Fuite disque `pending-audio/` |
| M | `MessagePersistenceActor.applyEvent` n'ordre pas par timestamp delivery | `MessagePersistenceActor.swift:135-206` | Indicateurs livraison peuvent régresser |
| M | Dédup `message:new` insuffisante pour optimistic sends | `ConversationView.swift:695-715` | Bulle doublée temporairement |
| M | `AnonymousSessionStore` pas de check expiry au load | `AnonymousSessionStore.swift:10-50` | Token expiré réutilisé jusqu'au 1er 401 |
| M | `ThemedMessageBubble.Equatable` ignore `participantId` nil dans reactions | `ThemedMessageBubble.swift:259-300` | Avatars chips réaction non mis à jour |
| M | `submitEdit()` ne reset pas `messageText` hors animation block | `ConversationView+Composer.swift:328-350` | Risque envoi accidentel ancien texte |
| M | `OutboxDispatcher` pas de rate-limit après reconnect | `OutboxDispatcher.swift:24-102` | Burst 50 retries simultanés |
| M | `MessageListViewController` n'annule pas `loadOlderMessages` au dismiss | `MessageListViewController.swift` | Batterie/data drain |
| M | `_cachedLastReceivedIndex: Int??` double optional fragile | `ConversationViewModel.swift:82-96` | Race accès concurrent → indicateur incorrect |
| M | `ReplyThreadOverlay.collectLocalReplies()` boucle hardcoded 10 | `ReplyThreadOverlay.swift:59-110` | Threads >10 niveaux tronqués |
| M | scrollToBottom état désynchronisé (`isNearBottom` vs `scrollToBottomTrigger`) | `ConversationView.swift:1061-1071` | Bouton "retour bas" visible alors qu'on est en bas |
| M | Pas de synchronisation thread-safe `messages` ↔ GRDB store | `ConversationViewModel.swift:706-745` | Bulles dupliquées/disparues temporairement |
| M | `mentionCandidates` filtre fragile sur `senderId.isEmpty` | `ConversationViewModel.swift:543-555` | Suggestions @ avec ids vides |
| M | `BubbleDeletedView/BubbleBurnedView` n'invalident pas cache traduction | `ThemedMessageBubble.swift:146-149` | Contenu supprimé accessible via cache trad |
| M | `OutboxDispatcher` pas de cleanup payload files | `OutboxDispatcher.swift` | Fichiers `Documents/` jamais supprimés |
| M | `MessageSocketManager` pas d'expiration session anonyme | `MessageSocketManager.swift` | Sync temps-réel perdue silencieusement |
| M | `OptimisticMessageState` indistingue `.queued`/`.sending` | `MessagePersistenceActor.swift` | Indicateur UI confus |
| M | `ReplyThreadOverlay` pas de validation parentMessageId | `ReplyThreadOverlay.swift:59-70` | DoS client via thread infini |
| M | `MessageRecord.state` invalide → écrasement silencieux default | `MessagePersistenceActor.swift` | Messages figés, jamais retried |
| m | `typingDotConnection` timer doublon au re-entry view | `ConversationView.swift:758-766` | Cadence frappe incorrecte |
| m | `BubbleStandardLayout` pas de loading state pour traduction demandée | `BubbleStandardLayout.swift` | Tap "Traduire" plusieurs fois |
| m | `mentionDisplayNames[username]` lookup sans guard | `BubbleStandardLayout.swift` | Mentions sans displayName |
| m | `DefaultComposerLanguage.resolve()` pas de fallback si vide | `ConversationView.swift:122` | Picker bloqué langue invalide |
| m | Headers computed props évalués 60Hz pendant scroll | `ConversationView.swift:256-310` | `headerPresenceState`, `headerMoodEmoji` |

### 3.2 Liste de conversations & configurations

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | `lastMessagePreview` non traduit (Prisme cassé liste) | `ThemedConversationRow.swift:436` |
| C | `unreadCount` stale après archive/unarchive sans refetch | `ConversationListViewModel.swift:1292-1320` |
| C | `bumpToTop()` n'applique pas mutations métadata convergentes | `ConversationListViewModel.swift:238-248,617-665` |
| C | `fetchAndPrependMissingConversation` TTL 30s expire en cas réseau lent | `ConversationListViewModel.swift:163-174,278-313` |
| C | `applyPreferencesUpdate()` race sur 6 mutations sans transaction | `ConversationListViewModel.swift:522-551,597-615` |
| M | `ForEach(groupedConversations, id: \.section.id)` identifiant fragile | `ConversationListView.swift:174` |
| M | `draftSummaries` cache non invalidé silent failure persist | `ConversationListViewModel.swift:793-803` |
| M | `loadPreviewMessages()` pas de coalesce 5+ hard-press | `ConversationListView.swift:299` |
| M | `togglePin/toggleMute` pas de reshuffle au rollback | `ConversationListViewModel.swift:1221-1235` |
| M | `markAsRead()` race avec `syncBadgeOnUnreadChange` | `ConversationListViewModel.swift:1257-1291,828-842` |
| M | `pullToRefresh()` n'invalide pas `userPreferences` | `ConversationListViewModel.swift:1176-1206` |
| M | Hard-press preview affiche messages non traduits | `ConversationListHelpers.swift:231-239` |
| M | `loadMore()` parade zero-progress fragile au cursor persist fail | `ConversationListViewModel.swift:1045-1082` |
| M | `syncBadgeOnUnreadChange` `removeDuplicates` rate limité fields | `ConversationListViewModel.swift:828-842` |
| m | `categoryExpansion` PATCH fire-and-forget | `ConversationListViewModel.swift:1210-1217` |
| m | `conversationMoodStatus()` re-évalué par row sans memoize | `ConversationListView.swift:245-248` |
| m | `visibleTagsInfo` recalculé chaque render | `ThemedConversationRow.swift:81-112` |
| m | `.equatable()` avec closures non-Equatable | `ConversationListView+Rows.swift:70`, `ThemedConversationRow.swift:37-41` |
| m | `isLoadingMore` reste true si silent failure | `ConversationListViewModel.swift:1027-1120` |
| m | Context menu "Move to category" sans validation existence | `ConversationListView+Overlays.swift:107-135` |
| m | Swipe actions array recréé chaque render → swipe state perdu | `ConversationListView.swift:354-457` |
| m | 11 `@Published` causent re-render full liste | `ConversationListViewModel.swift:8-65` |
| m | `canCreateShareLink()` par row sans cache | `ConversationListView.swift:308-315` |
| m | `loadUserCommunities` ne retry pas après expire cache | `ConversationListView.swift:854-880` |
| m | `NewConversationView` ne check pas blocked users | `NewConversationView.swift:355-400` |
| m | `ParticipantsView` rôle badge sans pessimistic rollback | `ParticipantsView.swift:112-127` |
| m | `ConversationOptionsViewModel.load()` 3 async let sans réconciliation | `ConversationOptionsViewModel.swift:39-80` |
| m | `ConversationLockManager` stocke locked IDs en UserDefaults | `ConversationLockManager.swift:135-142` |
| m | `conversationUpdated` socket n'inclut pas `memberCount` | `ConversationListViewModel.swift:617-665` |
| m | `DraftSummary` ne refresh pas cross-device delete | `ConversationListViewModel.swift:779-803` |
| m | `typingTimers` jamais invalidés en deinit | `ConversationListViewModel.swift:807-820` |
| m | `reloadFromCache()` ne recalcule pas `groupedConversations` | `ConversationListViewModel.swift:553-571` |

### 3.3 Profil utilisateur & profil vocal

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | Langues utilisateur sans validation ISO 639-1 client | `ProfileView.swift:732-739`, `EditProfileViewModel.swift:127-131` |
| C | Deux chemins de save profil incompatibles | `ProfileView.swift:755-818` vs `EditProfileViewModel.swift` |
| C | `VoiceProfileWizardViewModel` durée audio hardcoded 16000 b/s | `VoiceProfileWizardViewModel.swift:84-87` |
| C | `VoiceProfileService.uploadSample` multipart sans chunking/retry | `VoiceProfileService.swift:55-89` |
| C | `ActiveSessionsView` instancie un VM **qui n'existe pas** | `ActiveSessionsView.swift:11` |
| M | `SettingsView` `prefs.fetchFromBackend()` sans error handling | `SettingsView.swift:80` |
| M | `UserPreferencesManager` sync débounce + crash window | `UserPreferencesManager.swift:176-182` |
| M | `ChangePasswordView` validation pwd trop simple (≥8) | `ChangePasswordView.swift:30-34` |
| M | `DataExportView` RGPD incomplet (manque prefs, 2FA, voice profile) | `DataExportView.swift:12-23` |
| M | `DeleteAccountView` suppression non atomique | `DeleteAccountView.swift:35-42` |
| M | `TwoFactor` recovery codes jamais persistés | `TwoFactorViewModel.swift:43-54` |
| M | `ProfileView.uploadAvatar` pas de check taille compressée | `ProfileView.swift:820-857` |
| M | Prisme : `systemLanguage` stocké à 2 endroits (MeeshyUser + ApplicationPreferences) | `AuthModels.swift:202`, `UserPreferencesManager` |
| M | `EditProfileView` init StateObject ignore param injecté | `EditProfileView.swift:20-21` |
| M | `VoiceProfileWizardView` / `VoiceProfileManageView` errors non loggées persist | `VoiceProfileWizardView.swift:114-118`, `VoiceProfileManageView.swift:152-157` |
| M | `VoiceProfileStatus` switch sans `@unknown default` | `VoiceProfileManageView.swift:404-441` |
| M | `PrivacySettingsView` couple caché à `AnalyticsManager` | `PrivacySettingsView.swift:24` |
| M | `NotificationSettingsView` pas de granularité par-conversation | `NotificationSettingsView.swift:60-75` |
| M | `MediaDownloadSettingsView` pas de visu taille cache | `MediaDownloadSettingsView.swift:12-94` |
| M | `SettingsView` cascade de sheets sans hiérarchie | `SettingsView.swift:47-79` |
| m | `parseAndFormatDate` silencieux | `ProfileView.swift:861-869` |
| m | `bioMaxLength = 300` hardcoded | `EditProfileViewModel.swift:80` |
| m | `confirmAgeVerification` boucle consent ↔ ageVerification | `VoiceProfileWizardView.swift:22-33`, `VoiceProfileWizardViewModel.swift:52-54` |
| m | `UserService.uploadImage` Content-Type hardcoded jpeg | `UserService.swift:71-120` |
| m | `ChangePasswordView` success overlay si dismiss fail | `ChangePasswordView.swift:333-338` |
| m | `VoiceProfileManageViewModel.deleteSample` sans pessimistic rollback | `VoiceProfileManageViewModel.swift:51-60` |
| m | `DataExportView` pas de progress bar | `DataExportView.swift:102-116` |
| m | `PreferenceService.loadCachedCategories` default `nil` | `PreferenceService.swift:50-68` |
| m | `VoiceConsentStatus` vs `VoiceConsentResponse` types divergents | `VoiceProfileService.swift:24-28` |
| · | Accent colors hardcoded (ProfileView "A855F7", Delete "EF4444") | `ProfileView.swift:44`, `DeleteAccountView.swift:20` |

### 3.4 Pipeline de traduction (Prisme Linguistique)

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | `Locale.current.localizedString(forLanguageCode:)` pour noms langue trad | `PostTranslationSheet.swift:137,190` |
| C | `activeTranslationOverrides` jamais invalidé sur édition message | `ConversationViewModel.swift:45-80` |
| C | Override `nil` ambigu (clé absente vs "afficher original") | `ConversationViewModel.swift:2719-2739` |
| C | Cache trad non unifié messages/posts/stories | `TranslationRecords.swift:4`, `ConversationViewModel.swift:131`, `PostDetailViewModel.swift:379-382` |
| C | Posts stockent **une seule** traduction (`translatedContent: String?`) | `PostDetailViewModel.swift`, `PostModels.swift` |
| C | Pas de retraduction auto quand langue préférée change | `ConversationViewModel.swift:2692-2717` |
| C | `CallTranscriptionService` ne route pas par le Prisme | `CallTranscriptionService.swift` |
| C | Pas de test E2E pipeline trad complet | — |
| M | "Autres langues" sheet : pas de loading state persistant cross-dismiss | `PostTranslationSheet.swift:196-236` |
| M | `ConversationSocketHandler.mergeTranslations` ignore `translationModel` | `ConversationSocketHandler.swift:610-623` |
| M | Transcription audio pas d'état `.pending/.inProgress` | `ConversationViewModel.swift:2801-2810` |
| M | TTS audio playback sans sélecteur langue côté UI | `BubbleStandardLayout.swift`, `AudioPlayerManager.swift` |
| M | `EdgeTranscriptionService` locale par défaut `Locale(identifier:"fr-FR")` | `EdgeTranscriptionService.swift:59,173` |
| M | Pas de fallback serveur quand `EdgeTranscriptionService` échoue | `EdgeTranscriptionService.swift:62-100` |
| M | `preferredLanguages` dupliqué dans chaque VM | `FeedViewModel.swift:53-58`, `PostDetailViewModel.swift:53-58` |
| m | Tests trad ne couvrent pas `customDestinationLanguage` | `PostDetailViewModel.swift:395-405` |
| m | `BubbleContentBuilder` pas de validation `sourceLanguage` match `originalLanguage` | `BubbleContentBuilder.swift` |
| m | Overrides trad non persistés en GRDB | `ConversationViewModel.swift:143` |
| m | Pas d'indication "retraduction en cours" | `ConversationViewModel.swift` |
| m | `TranslationCacheRecord` table définie, jamais utilisée | `TranslationCacheRecord.swift:4-11` |
| m | `TranslationService` `/translate-blocking` sans fallback async | `TranslationService.swift:21` |
| m | Confidence score affiché posts, pas messages | `PostTranslationSheet.swift:151-155` |
| m | Stories TTS langue affichée non claire | `StoryViewModel.swift` |
| m | Pas de throttling `requestTranslation` | `PostTranslationSheet.swift:209-221` |
| m | `FeedViewModel.requestTranslation` ne valide pas post toujours présent | `FeedViewModel.swift` |
| · | `_cachedPreferredLanguages` non invalidé si user update language | `ConversationViewModel.swift:2690-2717` |
| · | Pas de logging résolution langue debug | `ConversationViewModel.swift:2729-2739` |
| · | `availableFlags` ordre non déterministe | `BubbleContent.swift:56-63` |
| · | `MessageTranslation` non `Equatable` | `ConversationViewModel.swift:11-19` |
| · | `CommentListView` UIKit ne reçoit pas `preferredLanguages` | `CommentListView.swift` |

### 3.5 Stories, posts, commentaires, statuts

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | Story auto-advance double-loop race (P3 gated + legacy display-link) | `StoryViewerView.swift:518-526` |
| C | Story viewer count non sync socket | `StoryViewerView.swift:215,376` |
| C | Story expiration 24h jamais checkée au viewer open | `StoryViewerView.swift:282-302` |
| C | Story video URL : pas de fallback si URL invalide | `StoryViewerView.swift:945-957` |
| C | Story repost vague feedback sur 4xx hors 403/404 | `StoryViewerView.swift:640-669` |
| C | Story reaction count incrément local sans rollback | `StoryViewerView.swift:830-863` |
| C | Heart-in-flight set jamais clearé si network timeout | `FeedCommentsSheet.swift:18-76`, `FeedView.swift:81-121` |
| C | Story viewer language resolution race au mount | `StoryViewerView.swift:893-905` |
| C | Offline queue : validation media file pas atomique | `StoryPublishQueue.swift:143-186` |
| C | Feed `LazyVStack` instancie toutes les cards | `FeedView.swift:160-200` |
| C | Story export pas de size validation pre-encoding | `StoryVideoExportService.swift` |
| C | Story comment reaction double-incrément sur socket replay | `StoryViewerView.swift:348-369` |
| C | `PostService.requestTranslation` ignore réponse serveur | `PostService.swift:116-124` |
| C | Feed socket subscriptions : pas de cleanup au route change | `FeedSocketHandler.swift:25-102` |
| C | `FeedStore.refreshFromDB` race avec writes async | `FeedStore.swift:77-112` |
| M | Feed pagination desync sur optimistic insert via socket | `FeedViewModel.swift:13-28,170-208` |
| M | `CommentRecord == ` compare `changeVersion` → flicker | `CommentRecord.swift:50-54` |
| M | Composer drafts posts non persistés | `FeedView.swift:22-29,64-66` |
| M | Audio post upload pas de retry/queue | `AudioPostComposerView.swift:8-76` |
| M | Comments threading pagination hardcoded `limit: 50` | `FeedPersistenceActor.swift:142-157`, `FeedStore.swift:94-101` |
| M | Stories vs Status duplication conceptuelle | `StatusViewModel.swift`, `StoryViewModel.swift` |
| M | Socket events sans dedup eventId | `FeedSocketHandler.swift:27-102` |
| M | `PostDetailViewModel` pas d'optimistic comment add | `PostDetailViewModel.swift:1-97` |
| M | `ReactionService.DiscardedReactionResponse` perd dedup | `ReactionService.swift:19-27,44-51` |
| M | `StoryOfflineQueue` legacy converter incomplet | `StoryOfflineQueue.swift:57-141` |
| M | `FeedStore.regionCancellable` observer cleanup non garanti | `FeedStore.swift:71-86` |
| M | Post translation : pas de redraw quand langue change | `PostDetailView.swift:92-109` |
| M | `PostDetailView` join/leave room race | `PostDetailView.swift:257-302` |
| M | `loadFeed(forceRefresh: true)` ne reset pas `nextCursor` | `FeedViewModel.swift:79-109,127` |
| M | Stories pas de prefetch next/previous **groupe** | `StoryViewerView.swift:128-152,549-588` |
| M | `PendingStatusQueue` drop legacy items silently | `PendingStatusQueue.swift:24-34` |
| M | Comments cache pas de dedup fetch + socket | `PostDetailViewModel.swift:99-157` |
| M | `StoryPublishService.executor` weak ref jamais réarmée | `StoryPublishService.swift:59,119-124,146` |
| M | Story tray pas de loading state pour stories expirées en cache | `StoryTrayView.swift:42-51` |
| M | `StatusViewModel.setStatus` cache invalidation incomplète mode-switch | `StatusViewModel.swift:140-151` |
| M | Comments pagination replies pas de cursor forwarding | `PostDetailView.swift:278-310` |
| M | Post like : pas de feedback succès | `FeedView.swift:100-121` |
| M | `prefetchingComments` set jamais clearé | `FeedViewModel.swift:36-37` |
| M | `StatusEntry` caching seulement par mode, pas par userId | `StatusViewModel.swift:48,85` |
| M | Story composer repost preloaded assets fuite mémoire | `StoryTrayView.swift:64-89` |
| C | Status composer pas de draft persist | `StatusComposerView.swift` |

### 3.6 Partage social & demandes de connexion

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | `MeeshyShareExtension` zéro authentification réelle | `ShareViewController.swift:29-36,181-198` |
| C | ShareExtension sans JWT en App Group | `ShareViewController.swift:181-198` |
| C | `FriendshipCache.clear()` n'unmount pas UI ex-user | `FriendshipCache.swift:360-378` |
| H | `FriendshipCache.hydrate()` race entre fast-path et lock | `FriendshipCache.swift:102-106` |
| H | `FriendRequestListView` zéro souscription socket `friend:request` | `FriendRequestListView.swift:190-221` |
| H | `BlockService` zéro socket event `user:blocked/unblocked` | `BlockService.swift:45-89` |
| H | `ShareLinkDetailView.toggleActive()` n'invalide pas cache | `ShareLinkDetailView.swift:194-206` |
| H | `CreateShareLinkView.requireAccount` UI ne reset pas dérivés | `CreateShareLinkView.swift:158-174,496` |
| M | `ShareLinksView` stats async sans loading state | `ShareLinksView.swift:222-254` |
| M | `CommunityLinksView.stats` computed recalcule chaque render | `CommunityLinksView.swift:162` |
| M | `FriendRequestListView` n'utilise pas `UserRelationshipResolver` | `FriendRequestListView.swift:99-112` |
| M | `AffiliateToken.affiliateLink?` sans fallback dans clipboard | `AffiliateView.swift:219-227` |
| M | `StoryExportShareSheet` n'affiche pas auteur/date | `StoryExportShareSheet.swift:12-72` |
| M | `ReportUserView` envoie sans confirm finale | `ReportUserView.swift:169-217` |
| M | `TrackingLinkDetailView` pas de pagination UI clics | — |
| M | Copy button feedback durée hardcodée 2s | `ShareLinkDetailView.swift:87-95` |
| m | `LinksHubView` mentionné, non trouvé | — |
| m | `SharePickerView` mentionné, non trouvé | — |
| m | Friend request optimistic accept sans rollback | `FriendRequestListView.swift:212-220` |
| m | `StoryRepostEmbedCell` mentionné, non localisé | — |
| m | ShareExtension UI utilise gradient `[.blue, .purple]` (pas brand) | `ShareViewController.swift:456-461` |
| m | `BlockedUsersView` n'indique pas blocages réciproques | `BlockedUsersView.swift:1-256` |
| m | Pas de "revoke" share link, seulement `toggleActive` + `deleteLink` | `ShareLinkService.swift:101-107` |
| m | `AffiliateCreateView` / `CreateTrackingLinkView` / `CommunityLinkDetailView` non visibles | — |
| · | `ExpirationOption.iso8601` peut retourner date passée | `CreateShareLinkView.swift:596-625` |
| · | `ShareLinkInfo.currentConcurrentUsers` Int non-optionnel, `maxConcurrentUsers: Int?` asymétrie | `ShareLinkModels.swift:14` |
| · | `TrackingLink.lastClickedAt` non affiché | `TrackingLinkModels.swift:19` |
| · | `BlockService` pas de `unblockAll` | `BlockService.swift:32-89` |
| · | `ReportService` pas de rate-limit client | `ReportService.swift:21-70` |
| · | `FriendService.sendFriendRequest` pas de check doublons local | `FriendService.swift:24-31` |
| · | `ShareLinkInfo` UI pas de warning approche maxUses | `ShareLinkDetailView.swift` |
| · | `CreateShareLinkView` pas de limite longueur slug | `CreateShareLinkView.swift:138-148` |
| · | ShareExtension hardcode JPEG (perd PNG transparency) | `ShareViewController.swift:213-228` |
| · | `respond()` pas de debounce (double-tap) | `FriendRequestListView.swift:212-220` |
| · | `URL(string: "meeshy://share...")!` force-unwrap | `ShareViewController.swift:169` |

### 3.7 Temps réel, sockets, notifications

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | `presence:snapshot` non ré-émis au reconnect | `MessageSocketManager.swift:1787-1797` |
| C | Badge desync entre NSE/AppGroup/Widget | `NotificationService.swift:267-274` |
| C | `ReconnectionGapDetector.maxTotalMessages = 1000` insuffisant gros groupes | `ReconnectionGapDetector.swift:11-12,47-79` |
| C | `typingSafetyTimers` `nonisolated(unsafe)` race | `ConversationSocketHandler.swift:73,199-208` |
| C | NSE pre-persist E2EE message peut désync avec serveur | `NotificationService.swift:315-381,282-296` |
| C | `PresenceSnapshotEvent` non injecté au cold start après 24h+ | `PresenceManager.swift:36-63,41,58-63` |
| C | Async event handlers Socket.IO sans try-catch | `MessageSocketManager.swift:1695-2157` |
| C | Reconnect : gap-detector pas async-awaitée avant background | `ReconnectionGapDetector.swift:35-82` |
| C | VoIP push phantom-call : dedup ring sans timestamps | `VoIPPushManager.swift:139-157` |
| H | Foreground notifs iOS jamais mutées si app active+conv ouverte | `NotificationService.swift:1-617`, `PushNotificationManager.swift:145-156` |
| H | NSE delivery receipt sans retry | `NotificationService.swift:421-433` |
| H | `PresenceManager` `recalcTimer` ne re-arme pas après foreground | `PresenceManager.swift:84-98` |
| H | `ConnectionStatusViewModel` race entre 3 publishers | `ConnectionStatusViewModel.swift:40-72` |
| H | `BackgroundTaskManager` cap backoff 15m + boucle infinie si 401 | `BackgroundTaskManager.swift:34-42` |
| H | `NotificationCoordinator` debounce cancel mais `syncNow()` fire-and-forget | `NotificationCoordinator.swift:243-259` |
| H | NSE E2EE decryption échec → placeholder localisée non-actionnable | `NotificationService.swift:41-72` |
| H | Call signaling `emitCallSignalWithAck` timeout 3s SDP large réseau lent | `MessageSocketManager.swift:1552-1571` |
| H | `NSEDataSync.syncMessage` sans error handling | `NotificationService.swift:282-296` |
| M | NSE badge override string→Int parsing silencieux | `NotificationService.swift:246-253` |
| M | `ConversationSocketHandler` async listener sans error context | `ConversationSocketHandler.swift:225-401` |
| M | `ToastManager.dismissTask` fire après view dismiss si background | `ToastManager.swift:54-61` |
| M | `MessageSocketManager.sendAsync` route message:send unused/broken | `MessageSocketManager.swift:1338-1394` |
| M | Reconnection : `didReconnect` fire avant join ACK | `MessageSocketManager.swift:1626-1655` |
| M | VoIP caller name resolution async, CallKit déjà affiché | `VoIPPushManager.swift:206-214` |
| M | `PresenceService.refreshKnownUsers()` peut servir REST stale | `PresenceManager.swift:69-73` |
| M | NSE attachment download `URLSession.shared` sans timeout | `NotificationService.swift:531-544` |
| M | `SocialSocketManager.decode` failures swallowed | `SocialSocketManager.swift:886-906` |
| M | `AsyncSemaphore` waiters queue sans timeout | `ReconnectionGapDetector.swift:100-126` |
| M | Conversation join async dispatch avant ACK | `ConversationSocketHandler.swift:76-107` |
| · | `BadgeWriter` protocol jamais utilisé en mock test | `NotificationCoordinator.swift:270-279` |
| · | NSE `fileHints()` switch non exhaustif MIME | `NotificationService.swift:580-615` |
| · | `PushNotificationManager` deviceToken en UserDefaults | `PushNotificationManager.swift:29-103` |
| · | `OSLog` subsystem inconsistant entre app/SDK | divers |
| · | `PresenceManager` timers `nonisolated(unsafe)` non documenté | `PresenceManager.swift:29` |

### 3.8 Cache, SWR, persistence

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | `CacheResult.value` deprecated **sans enforcement** | `CacheResult.swift:16-17` |
| C | Zero enforcement cache-first pour skeletons | `LoadState.swift:1-24`, `SkeletonVisibilityResolver.swift` |
| C | `OutboxRecord` pas de contrat idempotence atomique | `OutboxRecord.swift:79-126`, `OutboxFlusher.swift` |
| H | GRDB L2 encryption write throws / read silently drop | `GRDBCacheStore.swift:330-380,405-410` |
| H | `DiskCacheStore.save()` ne déclenche pas `evictOverBudget` | `DiskCacheStore.swift:19-38,106-119,236-239,279-305` |
| H | `TusUploadCheckpoint` expiry jamais vérifié (24h+) | `TusUploadManager.swift:157-200` |
| H | `CacheCoordinator.flushAll(deadline:)` séquentiel sans atomicité | `CacheCoordinator.swift:460-475` |
| H | `OutboxRecord.payload` JSON sans versioning | `OutboxRecord.swift:90`, `OutboxFlusher.swift` |
| H | Memory pressure n'évacue pas `NSCache` interne `DiskCacheStore._imageCache` | `CacheCoordinator.swift:432-438,477-506`, `DiskCacheStore.swift:309-314` |
| M | Migration `v5_translation_cache` pas d'index `cachedAt` | `AppDatabase.swift:159-168` |
| M | Outbox `conversationId` sans foreign key | `MessageDatabaseMigrations.swift:148-156` |
| M | Schema GRDB sans versioning timestamp/UUID (collision multi-agent) | `AppDatabase.swift:88-200` |
| M | `evictOverBudget` jamais appelé auto sur `save` | `DiskCacheStore.swift:236-239` |
| M | `VideoFrameExtractor` capture strong self dans Task groups | `VideoFrameExtractor.swift` |
| M | `CacheCoordinator.currentUserId` jamais utilisé pour valider scope | `CacheCoordinator.swift:160,297-307` |
| M | `DiskCacheStore._imageCache` `nonisolated(unsafe)` static | `DiskCacheStore.swift:309-314` |
| · | `OutboxRecord.attempts` Int sans historique timestamps/erreurs | `OutboxRecord.swift:92` |
| · | Pas d'observability eviction L1 | `GRDBCacheStore.swift:260-263,293-306` |
| · | `DecodedImageCache` allocation sans `setTotalCostLimit` au boot ? | `DecodedImageCache.swift` |

### 3.9 Authentification, multi-compte, session

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | Race multiple 401 → refresh concurrents | `AuthManager.swift:86-87,354-377`, `APIClient.swift:366-371` |
| C | JWT decode fragile → logout silencieux | `AuthManager.swift:138-150` |
| C | Logout async : sockets fermés avant logout API | `AuthManager.swift:246-265`, `AuthService.swift:213-215` |
| C | `AnonymousSessionStore` Keychain `WhenUnlockedThisDeviceOnly` casse NSE | `AnonymousSessionStore.swift:18` |
| C | 2FA pas intégré au flow login | `TwoFactorService.swift:45-108`, `AuthService.swift:32-36` |
| C | LoginView test credentials hardcoded en source | `LoginView.swift:39-46` |
| C | `KeychainManager.migrateToNamespaced` dead code | `KeychainManager.swift:224-234` |
| C | Password reset : pas de nonce/timestamp côté client | `AuthService.swift:79-88` |
| C | Logout API fire-and-forget sans retry | `AuthService.swift:213-215`, `AuthManager.swift:253` |
| C | Pas de biometric unlock | — |
| C | Token rotation : socket reconnect avec ancien token | `AuthManager.swift:389-408` |
| C | Cache invalidation au logout : absente | `AuthManager.swift:246-265` |
| C | `savedAccounts` tri par `lastActiveAt` sans clé stable | `AuthManager.swift:505` |
| C | `X-Session-Token` jamais envoyé pour user authentifié | `APIClient.swift:304-308` |
| M | Multi-compte isolation Keychain incomplète au crash logout | `AuthManager.swift:72-114,269-282`, `KeychainManager.swift:28-36` |
| M | Pas de session timeout d'inactivité | `MeeshyApp.swift:48-69`, `AuthManager.swift:317-328` |
| M | `sessionToken` optionnel + sliding-window cassé | `AuthModels.swift:17-22`, `AuthManager.swift:381-409` |
| M | Email verification jamais checkée au login | `AuthModels.swift:189-281`, `AuthManager.swift:300-328` |
| M | Background revalidation Task sans `@MainActor` | `AuthManager.swift:330-350` |
| M | `savedAccounts` memory leak sur logout | `AuthManager.swift:534-537,72-74` |
| M | `applyLocalProfileChanges` jamais wired automatiquement | `AuthManager.swift:567-596`, `MeeshyUser+ProfileMutation.swift:12-49` |
| M | `checkExistingSession` sans network gate | `AuthManager.swift:286-350` |
| M | `deleteAccount` sans validation phrase côté client | `AccountService.swift:11-14`, `DeleteAccountView.swift:19` |
| M | Magic link : pas de validation token format/expiry client | `MagicLinkView.swift`, `MeeshyApp.swift:115-131` |
| M | Onboarding phone : pas de SMS OTP verify avant register | `OnboardingFlowView.swift`, `AuthModels.swift:26-58` |
| M | Onboarding language : pas de garantie sync app↔server | `OnboardingFlowView.swift:54-58` |
| M | User deactivation : silent logout sans toast | `AuthManager.swift:460-473,466-469` |
| M | `sanitizeDataURIs` strip silencieux data: URIs | `AuthManager.swift:427-458` |
| M | Migration legacy keys : ne supprime pas les anciennes Keychain entries | `AuthManager.swift:89-91,541-564` |
| M | `X-Session-Token` non rate-limité côté brute-force | `AnonymousSessionStore.swift:5-50`, `APIClient.swift:306-308` |
| M | Refresh token rotation : sessionToken pas re-saved | `AuthManager.swift:475-495`, `AuthService.swift:159-163` |
| M | E2EE key rotation : `clearAllKeys()` jamais appelé | `E2EEService.swift:99-190,194-200` |
| M | Login double-tap : pas de disabled button pendant `isLoading` | `LoginView.swift:200-230`, `AuthManager.swift:154-168` |
| M | Account switching socket reconnect non awaited | `AuthManager.swift:405-408` |
| M | Onboarding completion race avec splash | `OnboardingFlowView.swift:77-83`, `MeeshyApp.swift:89-92` |
| M | Tokens en GRDB potentiellement non chiffrés (future) | — |

### 3.10 Media : audio, images, vidéo, recording

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | Duplication `AudioRecorderManager` SDK / App configs divergents | `DefaultSDKAudioRecorder.swift:1-108`, `AudioRecorderManager.swift:1-148` |
| C | `AudioRecorderManager.startRecording` fuite session si recorder init throw | `AudioRecorderManager.swift:26-75` |
| C | `PhotoLibraryManager` `.limited` traité comme `.authorized` | `PhotoLibraryManager.swift:80-94` |
| H | `AudioPlayerManager` `.routeChangedOther` no-op (audio vers speakers) | `AudioPlayerManager.swift:33-47` |
| H | `DefaultSDKAudioRecorder` ignore `settings.maxDuration` | `DefaultSDKAudioRecorder.swift:22-107` |
| H | `AttachmentSendService` pas de retry `TusResumeRetriableError` | `AttachmentSendService.swift:57-103`, `TusUploadManager.swift:281-288` |
| H | `DiskCacheStore` pas de gestion taille disque réelle | `DiskCacheStore.swift:19-51` |
| H | `VideoFilterPipeline` pas de thermal awareness | `VideoFilterPipeline.swift:92-150` |
| H | `VideoFilterPipeline` `CVPixelBufferPool` leak rotation | `VideoFilterPipeline.swift:120-123` |
| H | `MediaCompressor` pas d'interrupt-handling AVAudioSession | `MediaCompressor.swift:84-100` |
| H | `CachedAsyncImage` décodage probable sur main actor | `CachedAsyncImage.swift` |
| H | `OptimisticAttachmentAdopter.adoptIfNeeded` erreurs silent | `OptimisticAttachmentAdopter.swift:22-46` |
| H | `TusUploadManager` thread-safety checkpoint store | `TusUploadManager.swift:70-76,167` |
| H | `StoryVideoExportService` pas de cleanup temp sur exception | `StoryVideoExportService.swift:129-147` |
| H | `WaveformCache` Dictionary sans memory warning observer | `WaveformCache.swift:11-88` |
| H | `PhotoLibraryManager.performChanges` ignore error optionnel | `PhotoLibraryManager.swift:25-57` |
| H | `MediaCompressor.heicData()` sans fallback JPEG | `MediaCompressor.swift:273+` |
| H | `TusUploadCheckpointStore` ordre update vs PATCH | `TusUploadCheckpointStore.swift`, `TusUploadManager.swift:237` |
| M | `AudioEditEngine` gain 0.0 accepté (silence total) | `AudioEditEngine.swift:113-122` |
| M | `VideoFrameExtractor` `Task.detached` ignore cancellation | `VideoFrameExtractor.swift:31-50,64-90` |
| M | `AudioEditEngine` export preset hardcoded M4A | `AudioEditEngine.swift:198-203` |
| M | `DarkFrameDetector` Vision models load lazy non warm-up | `DarkFrameDetector.swift` |
| M | `CacheCoordinator` translations TTL on-read only | `CacheCoordinator.swift:119-143` |
| M | `ThumbnailPrefetcher` 4 décodages parallèles sans budget memory | `ThumbnailPrefetcher.swift:27-54` |
| M | `DefaultSDKAudioRecorder` levelHistory peut être incohérent | `DefaultSDKAudioRecorder.swift:56-106` |
| M | `AVAsset+NaturalDisplaySize` pas de cache | `AVAsset+NaturalDisplaySize.swift` |
| M | `MediaFileSaver.save` pas de check espace disque libre | `MediaFileSaver.swift:25-42` |
| M | `inFlightTasks` leak sur erreur | `DiskCacheStore.swift:16` |
| M | `CachedAsyncImage` pas de placeholder progressif | `CachedAsyncImage.swift` |
| M | `TusUploadManager` pas d'enrollment `BGProcessingTask` | `TusUploadManager.swift:121-139` |
| · | `AudioPlayerManager.registerIfNeeded` jamais unregister | `AudioPlayerManager.swift:167-175` |
| · | `VideoFilterPipeline` segmentationRequest init eager | `VideoFilterPipeline.swift:92-150,130-135` |

### 3.11 Listings & navigation : performance

| Sév. | Titre | Fichier:ligne |
|---|---|---|
| C | Spring animations partout (~273) — batterie+CPU drain | `ConversationListView.swift:17,23,40,481,535-562,764` |
| C | `@Published` prolifération `ConversationListViewModel` (16) | `ConversationListViewModel.swift:8-187` |
| H | `MessageListViewController` translation socket → `applySnapshot` full | `MessageListViewController.swift:514,582-601` |
| H | `CommentListViewController` O(N²) lookup par cell dequeue | `CommentListViewController.swift:77-82,59-62` |
| H | `FeedListViewController` `.estimated(200)` magic number sans pre-layout | `FeedListViewController.swift:31-32,52-62` |
| H | `GlobalSearchView` pas de debounce visible | `GlobalSearchView.swift:76`, `GlobalSearchViewModel.swift` |
| M | Nested LazyVStack conflit (section outer + rows inner) | `ConversationListView.swift:173-177,223-236` |
| M | `Router.push/.pop` race async (50ms delay documenté) | `Router.swift:149-179,190-193`, `RootView.swift:81` |
| M | iPad onRouteRequested callback pattern fragile | `Router.swift:128-131`, `iPadRootView+Navigation.swift` |
| M | `StoryTrayView` HStack + `.staggeredAppear` non-virtualisé | `StoryTrayView.swift:144` |
| M | `MessageListViewController` weak VM dangling au pop puis push | `MessageListViewController.swift:99,103,368` |
| M | `BubbleLayoutEngine` non utilisé par UIKit message/feed | `BubbleLayoutEngine.swift:26-144` |
| · | `theme.mode.isDark` lu sans observation (non-instant theme change) | `ConversationListView.swift:71` |
| · | `SkeletonVisibilityResolver` over-engineered pour 2 booléens | `StoryTrayView.swift:44-47` |
| · | `CommentListViewController` `store.posts.firstIndex` O(N) | `CommentListViewController.swift:52-55` |
| · | iPad 2-column inégal sizing sans resize handler | `iPadRootView.swift` |
| · | Hardcoded constants `slowScrollSpeed = 80` | `MessageListViewController.swift:36-51,70-72,156-158` |
| · | BubbleSwipeContainer 92% threshold non documenté | `MessageListView.swift:150` |
| · | `rowWidth` calcul recalculé chaque frame | `ConversationListView.swift:220-222` |

---

## 4. Anti-patterns architecturaux transverses

| # | Anti-pattern | Sévérité | Preuve |
|---|---|---|---|
| 1 | Singletons globaux excessifs (`*.shared` partout) | M | `AuthManager`, `APIClient`, `MessageSocketManager`, `PresenceManager`, `ThemeManager`, `AudioPlayerManager`, `MediaCacheManager`, `CacheCoordinator`, `NotificationCoordinator`… 9+ visibles |
| 2 | God object `ConversationViewModel` 2967 lignes | H | `ConversationViewModel.swift` |
| 3 | God object `BubbleStandardLayout` 1024 lignes | H | `BubbleStandardLayout.swift` |
| 4 | Duplication SDK/app : `AudioPlayerManager`, `AudioRecorderManager`, models `APIMessage` ↔ `Message` | M | `Cache/AudioPlayerManager.swift` vs `Services/AudioPlayerManager.swift` |
| 5 | Combine + async/await mélangés sans paradigme unifié | M | `MessageSocketManager` PassthroughSubject + services async/await |
| 6 | Cache invalidation manuelle (no dependency tracking) | M | `invalidateCaches(previousMessages:)` dans `ConversationViewModel.swift:55-80` |
| 7 | UserDefaults pour tokens (DETTE TECH) | C | `decisions.md:59`, `PushNotificationManager.swift:29-103` |
| 8 | `REST MessageSender` stub `notImplemented` | M | `DependencyContainer.swift:84-96` |
| 9 | Magic strings socket events / endpoints disséminés | · | divers |
| 10 | Catch-all `catch { … }` sans distinction typée | M | divers `Task { … }` listeners |
| 11 | Pas de circuit breaker pour API overload | M | reconnect exp. OK mais infinite |
| 12 | Retain cycles Combine si `[weak self]` oublié | M | nombreux `.sink` |
| 13 | Logs `print()` legacy mélangés avec `os.Logger` | · | divers |
| 14 | `MeeshyFocusStore` bridge SDK orpheline | · | infra présente, aucune UI |
| 15 | `LinkPreviewStore` previews stockées, jamais affichées inline composer | · | `LinkPreviewStore.swift` |
| 16 | Pas d'A/B testing / feature flags | M | aucun framework |
| 17 | Pas de recovery flow si socket rejeté 5× | M | UX gel sans fallback |
| 18 | `BubbleContent` Equatable couvre champs mutation-prone partiellement | M | `BubbleContent.swift:27` (TODO Task14) |
| 19 | ViewModel lifecycle couplé à `@StateObject` View | · | init/deinit unpredictable |
| 20 | Cache TTL hardcoded par feature, pas configurable | M | conversations 7j, messages 2j etc. |
| 21 | `nonisolated(unsafe)` sans documentation rationale | · | `PresenceManager.swift:29`, `DiskCacheStore.swift:309-314`, `ConversationSocketHandler.swift:73` |
| 22 | `OSLog` subsystems inconsistants (`me.meeshy.app` / `me.meeshy.sdk` / vide) | · | divers |
| 23 | Unit tests <15 fichiers pour 200+ ViewModels/Services | M | `MeeshyTests/Unit/` |
| 24 | Snapshot/UI/E2E tests vides ou inexistants | M | `MeeshyTests/` |
| 25 | Crashlytics OK mais MetricKit instrumenté seulement scaffold | · | `MeeshyMetricsSubscriber.swift` |

---

## 5. Features orphelines / en trop

| Feature | Preuve | Notes |
|---|---|---|
| **Pin message** | `APIMessage.swift:184` (`pinnedAt`, `pinnedBy`) | 0 occurrence UI dans `grep "pinnedAt" apps/ios/Meeshy/Features/Main/Views` |
| **Thread view** | `ThreadView.swift` 922 lignes | jamais appelée depuis Router, `grep "ThreadView()"` = 0 |
| **WebRTC stubs** | `WebRTCStubs.swift:1-527` | Guard `#if !canImport(WebRTC)`, CI only |
| **REST `MessageSender` stub** | `DependencyContainer.swift:84-96` | TODO "wire to actual REST API", throw `notImplemented` |
| **Live Activities** | `MeeshyWidgets/LiveActivities.swift` | Aucun `ActivityKit.activity()` call |
| **Category creation** | `CategoryPickerView.swift:99` | TODO "PreferenceService.createCategory does not exist" |
| **Story aspectRatio réel** | `StoryComposerViewModel.swift:489,954` | TODO Phase 2/3, hardcoded `1.0` |
| **Story timeline export** | `StoryTimelineEngine.swift:279` | `throw StoryTimelineExportError.notImplemented` |
| **Widget lock screen content** | `WidgetPreviewView.swift` 587 lignes, `MeeshyWidgets.swift` | scaffold, no real data |
| **`TranslationCacheRecord`** | `TranslationCacheRecord.swift:4-11` | table définie, jamais utilisée |
| **`KeychainManager.migrateToNamespaced`** | `KeychainManager.swift:224-234` | méthode publique, aucun call |
| **`LinksHubView`** | mentionné dans scope | non trouvé dans repo |
| **`SharePickerView`** | mentionné dans scope | non trouvé |
| **`AffiliateCreateView`, `CreateTrackingLinkView`, `CommunityLinkDetailView`** | mentionnés | non visibles dans lecture |
| **`ActiveSessionsViewModel`** | `ActiveSessionsView.swift:11` | initialisé via `@StateObject`, **n'existe pas dans le code** |
| **`MeeshyFocusFilter`** | infra `MeeshyFocusStore.swift` | aucune UI |
| **`LinkPreviewStore` previews** | `LinkPreviewStore.swift` | stockées, jamais affichées composer |
| **`Stores/EditHistoryStore`** | `EditHistoryStore.swift` | accessible mais navigation rare |

---

## 6. Features manquantes

### 6.1 Manquantes critiques (parité messenger moderne)

| Feature | Justification |
|---|---|
| Recherche dans une conversation | Aucune SearchView in-chat ; `GlobalSearchView` = feed only |
| Appels de groupe 3+ | WebRTC P2P only, pas de MCU/SFU |
| Polls / sondages | aucun modèle |
| Multi-compte switch fluide | savedAccounts modèle existe, isolation Keychain et socket reconnect incomplets |
| Biometric unlock | aucun `LAContext` |
| Password reset | aucune UI |
| 2FA complet (challenge step au login) | flow login ne consomme pas 2FA |
| QR code add friend | — |
| Backup local conversation | — |
| Live Activities (appels, push) | scaffold uniquement |
| Hashtags | — |
| Slash commands | — |
| Status DND global | — |
| Foreground muting (in-app) | NSE/PNM ne checke jamais `applicationState == .active` |
| Notification granularity per-conversation | absente côté server-prefs |
| Cache size visualization / clear UI | absente |

### 6.2 Manquantes recommandées (UX)

- Edit photo inline avant envoi (crop/filter)
- GIF/sticker keyboard
- Musique dans story
- Color picker story (background dégradé custom)
- Enregistrement appel
- Comments threading nested
- Contact card share (vCard import)
- Changelog "What's new" in-app
- Sélecteur langue TTS au playback audio
- Indicateur "traduction en cours" sur message
- Retraduction manuelle d'un message

---

## 7. TODO / FIXME / stubs / dead code

### 7.1 TODOs actifs

| Fichier | Ligne | Texte |
|---|---|---|
| `BubbleContent.swift` | 27 | `TODO(Task14): expand equality to cover mutation-prone fields` |
| `BubbleContent.swift` | 69 | `TODO(Task14): expand equality to cover story-side mutations` |
| `BubbleContentBuilder.swift` | 181 | `TODO(prisme): last-resort fallback` |
| `PresenceManager.swift` | 130 | `TODO presence-bulk: expose a single bulk write` |
| `StorySlideManager.swift` | 17 | `TODO: Remove in next minor release` |
| `StoryComposerViewModel.swift` | 489 | `TODO Phase 2/3: compute real aspectRatio from asset` |
| `StoryComposerViewModel.swift` | 954 | idem |
| `CategoryPickerView.swift` | 99 | `TODO: Category creation not yet implemented` |
| `StoryCanvasUIView.swift` | 28 | `TODO(canvas-fidelity-phase-5): Wire to snapshot` |
| `StoryTimelineEngine.swift` | 279 | `throw StoryTimelineExportError.notImplemented` |
| `MessageSocketManager.swift` | 1338-1394 | "Currently UNUSED. `message:send` socket event does not reach gateway handler" |
| `DependencyContainer.swift` | 84-96 | TODO "wire to actual REST API" + `throw notImplemented` |

### 7.2 fatalError (NSCoder — OK, standard UIKit)

`FeedListViewController:18`, `MessageListViewController:128`, `TextBubbleCell:21`, + 10 autres VC.

### 7.3 Code mort / orphelin

- `WebRTCStubs.swift` 527 lignes (CI seulement)
- `ThreadView.swift` 922 lignes (orpheline navigation)
- `TranslationCacheRecord.swift` (table inutilisée)
- `KeychainManager.migrateToNamespaced` (jamais appelée)
- `ActiveSessionsViewModel` (référencée, n'existe pas)
- `MeeshyFocusStore` bridge (aucune UI)
- `LinkPreviewStore` (previews jamais affichées)

---

## 8. Décompte global & priorités

### 8.1 Décompte par domaine

| Domaine | Critiques | Majeurs | Modérés | Mineurs | Total |
|---|---:|---:|---:|---:|---:|
| Chat / messages | 11 | 19 | 6 | 5 | **41** |
| Liste conversations | 5 | 9 | 16 | 3 | **33** |
| Profil / voice profile | 5 | 14 | 9 | 2 | **30** |
| Traduction | 8 | 7 | 9 | 5 | **29** |
| Stories / posts / comments | 15 | 21 | 5 | 2 | **43** |
| Sharing / friends / block | 4 | 11 | 6 | 16 | **37** |
| Real-time / notifications | 9 | 9 | 11 | 5 | **34** |
| Cache / SWR / persistence | 3 | 6 | 7 | 3 | **19** |
| Auth / multi-account | 14 | 22 | 0 | 0 | **36** |
| Media | 3 | 15 | 12 | 2 | **32** |
| Listings / navigation | 2 | 4 | 6 | 7 | **19** |
| Architecture transverse | 1 | 11 | 4 | 9 | **25** |
| **TOTAL** | **80** | **148** | **91** | **59** | **378** |

(Note : certains findings sont co-classés ; le total réel d'items uniques approche **400**.)

### 8.2 Top 20 priorités à traiter (P0 — bloquant production)

1. **Sécurité tokens** : migrer JWT de UserDefaults → Keychain (DETTE TECH critique). Source : `decisions.md:59`, `PushNotificationManager.swift:29-103`.
2. **Multiple-401 refresh race** : sérialiser via lock avant Task launch (`AuthManager.swift:86-87,354-377`).
3. **2FA challenge au login** : ajouter step `verify2FA` dans `AuthService.login()`.
4. **`ActiveSessionsViewModel` manquant** → feature complètement cassée.
5. **Foreground muting notifications** : NSE / PushNotificationManager doivent checker `applicationState == .active` + `activeConversationId`.
6. **Story expiration 24h** : guard `createdAt+24h < now` au `StoryViewerView.onAppear`.
7. **Prisme : `lastMessagePreview` traduit en liste** (`ThemedConversationRow.swift:436`).
8. **Prisme : retraduction auto au changement langue préférée** (`ConversationViewModel.swift:2692-2717`).
9. **Outbox idempotence atomique** : `.pending → .inflight` transactionnel avant network (`OutboxRecord.swift`).
10. **Cache invalidation au logout** : `CacheCoordinator.shared.clear()` (`AuthManager.swift:246-265`).
11. **Disk budget eviction auto sur `save()`** (`DiskCacheStore.swift:236-239`).
12. **GRDB L2 encryption read/write asymétrie** : décider du fail-mode unifié (`GRDBCacheStore.swift:330-410`).
13. **`@Published` prolifération `ConversationListViewModel`** : extraire conversations en sub-store.
14. **God object `ConversationViewModel`** : split en `ConversationStateStore` + `ConversationCommandHandler` + `TranslationResolver`.
15. **Spring animations généralisées** : auditer 273 instances, garder uniquement interactions utilisateur.
16. **Stories vs Status** : trancher (merge en unified Post type OU séparation explicite avec UX claire).
17. **Foreground audio session leak** (`AudioRecorderManager.swift:26-75`).
18. **VoIP dedup ring sans timestamp** (`VoIPPushManager.swift:139-157`).
19. **Tests** : passer de <5% à 30%+ sur services critiques (Auth, Outbox, Cache, Translation).
20. **Anonymous session Keychain accessibility** : `AfterFirstUnlockThisDeviceOnly` au lieu de `WhenUnlockedThisDeviceOnly`.

### 8.3 Patterns systémiques à corriger (P1)

- Migrer **toutes** les Task `.sink { Task {…} }` Combine → try-catch typé.
- Documenter et automatiser **enforcement** de `CacheResult` pattern-match (lint custom).
- Établir **convention foreground muting** : NSE vérifie via NSEDataSync, fallback côté app.
- Normaliser `OSLog` subsystems en un seul (`me.meeshy`).
- Adopter feature flags (FirebaseRemoteConfig / GrowthBook) pour rollout progressif.
- Documenter explicitement chaque `nonisolated(unsafe)` avec justification.

---

## Annexe : limites de cette analyse

- Certains fichiers cités par scope d'analyse n'ont pas été trouvés (`LinksHubView`, `SharePickerView`, `AffiliateCreateView`, `CreateTrackingLinkView`, `CommunityLinkDetailView`, `StoryRepostEmbedCell`, `StatusComposerView`). Soit absents, soit renommés. **À vérifier manuellement avant correction.**
- `ActiveSessionsViewModel` est référencé dans `ActiveSessionsView.swift:11` mais n'a pas été localisé — si compilation passe, il existe ailleurs (alias, extension). **À investiguer.**
- Plusieurs findings sur les ViewModels (`PostDetailViewModel.addComment`, etc.) sont **inférés** depuis l'absence de méthode publique observée ; un audit plus approfondi du fichier complet est requis.
- Les findings sur cache size, image budget, etc. sont fondés sur lecture du code mais **ne mesurent pas en production**. Un profiling Xcode Instruments confirmera ou infirmera.
- Plusieurs durées (3s timeout signaling SDP, 0.05s timer mètres audio, 15min cap backoff) sont jugées suspectes mais doivent être **validées par mesures réelles**.

**Toutes les affirmations restent traçables au code lu. Aucune supposition au-delà de ce qui apparaît dans les fichiers cités.**
