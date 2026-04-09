# Plan de couverture de tests - MeeshySDK + iOS App (112 points)

> Objectif : couverture complète du SDK et de l'application iOS avec des tests concrets et réels.
> Convention : `test_{method}_{condition}_{expectedResult}` | Factory `makeSUT()` | Protocoles mockés

---

## Phase 1 — MeeshySDK : Services manquants (21 tests)

Les services suivants n'ont AUCUN test. Chaque fichier de test couvre le protocole `{Service}Providing` avec mock APIClient.

- [ ] **1. AccountServiceTests** — `deleteAccount()`, `deactivateAccount()`, `reactivateAccount()` : vérifie les endpoints appelés, la gestion d'erreur réseau, et le décodage de la réponse
- [ ] **2. AffiliateServiceTests** — `createToken()`, `getStats()`, `listTokens()` : vérifie la création de token affilié, le parsing des stats, la pagination
- [ ] **3. AttachmentServiceTests** — `uploadAttachment(data:mimeType:)`, `downloadAttachment(id:)`, `deleteAttachment(id:)` : vérifie l'upload multipart, le téléchargement avec progress, la suppression
- [ ] **4. CommunityServiceTests** — `create()`, `update()`, `delete()`, `listMembers()`, `addMember()`, `removeMember()`, `list()`, `getById()` : CRUD complet + gestion des rôles membre
- [ ] **5. CommunityLinkServiceTests** — `createLink()`, `getLink()`, `revokeLink()`, `listLinks()` : vérifie la génération de lien, la révocation, le listing paginé
- [ ] **6. ConversationAnalysisServiceTests** — `analyze(conversationId:)`, `getSummary()` : vérifie le décodage de l'analyse IA, le handling de conversations vides
- [ ] **7. DataExportServiceTests** — `requestExport()`, `getExportStatus()`, `downloadExport()` : vérifie le flow async export (pending → ready → download)
- [ ] **8. EdgeTranscriptionServiceTests** — `transcribe(audioData:)`, `getSegments()` : vérifie la transcription on-device, le découpage en segments, le fallback si WhisperKit indisponible
- [ ] **9. LocationServiceTests** — `shareLocation()`, `stopSharing()`, `getActiveLocations()` : vérifie le partage de localisation live, l'arrêt, le listing des locations actives
- [ ] **10. MentionServiceTests** — `searchMentions(query:conversationId:)`, `getMentionCandidates()` : vérifie la recherche de mentions avec filtre par conversation, les candidats triés
- [ ] **11. NotificationServiceTests** — `list(cursor:limit:)`, `markRead(id:)`, `markAllRead()`, `delete(id:)` : vérifie le listing paginé, le marquage lu, la suppression
- [ ] **12. SessionServiceTests** — `listSessions()`, `revokeSession(id:)` : vérifie le listing des sessions actives, la révocation d'une session spécifique
- [ ] **13. ShareLinkServiceTests** — `createShareLink()`, `getStats(linkId:)`, `listLinks()`, `revokeLink()` : vérifie la création de lien partageable, les stats de clic, la révocation
- [ ] **14. StatsServiceTests** — `getUserStats(userId:)` : vérifie le décodage de toutes les métriques utilisateur (messages envoyés, conversations, temps de réponse moyen)
- [ ] **15. TranslationServiceTests** — `translate(messageId:targetLanguage:)`, `getTranslations(messageId:)` : vérifie la traduction à la demande, le cache des traductions existantes
- [ ] **16. VoiceProfileServiceTests** — `createProfile()`, `uploadSample()`, `deleteSample()`, `enableCloning()`, `disableCloning()`, `getProfile()` : vérifie le flow complet voice cloning
- [ ] **17. TrackingLinkServiceTests** — `createLink()`, `getAnalytics()`, `listLinks()` : vérifie la création de tracking link, les analytics de clic
- [ ] **18. UserPreferencesManagerTests** — `getPreferences(category:)`, `updatePreferences(category:values:)`, `clearCache()` : vérifie le caching local des préférences, l'invalidation après update
- [ ] **19. FriendServiceTests (SDK)** — `listFriends()`, `searchFriends()`, `sendRequest()`, `acceptRequest()`, `declineRequest()`, `receivedRequests()`, `sentRequests()` : vérifie chaque opération avec mock API, la pagination
- [ ] **20. StatusServiceTests (SDK)** — `list()`, `getByUserId()`, `create()`, `update()`, `delete()` : CRUD complet des statuts
- [ ] **21. ConversationSyncEngineTests** — `sync(conversationId:)`, `getSyncState()` : vérifie la synchronisation incrémentale messages/réactions/transcriptions, la gestion de conflit

---

## Phase 2 — MeeshySDK : Infrastructure & Core (16 tests)

- [ ] **22. KeychainManagerTests** — `save(token:for:)`, `load(for:)`, `delete(for:)`, `clearAll()` : vérifie le stockage sécurisé, la récupération, la suppression, le nettoyage complet. Teste aussi les erreurs Keychain (errSecDuplicateItem, errSecItemNotFound)
- [ ] **23. NetworkMonitorTests** — `start()`, `isConnected`, `connectionType` : vérifie la détection de connectivité (wifi/cellular/none), les transitions online↔offline, la publication d'événements
- [ ] **24. TusUploadManagerTests** — `upload(data:to:)`, `resume(uploadId:)`, `cancel(uploadId:)` : vérifie l'upload chunké, la reprise après interruption, l'annulation, le progress callback
- [ ] **25. SocketConfigTests** — init avec URL/namespace/options : vérifie la construction de la config Socket.IO, les headers d'auth, la reconnection policy
- [ ] **26. WaveformCacheTests** — `cache(waveform:for:)`, `get(for:)`, `evict(for:)` : vérifie le stockage/récupération de waveforms, l'éviction LRU
- [ ] **27. WaveformGeneratorTests** — `generate(from:samplesCount:)` : vérifie la génération de données waveform à partir d'audio data, le nombre d'échantillons, les valeurs normalisées [0,1]
- [ ] **28. AudioRecordingTests** — `startRecording()`, `stopRecording()`, `pauseRecording()`, `resumeRecording()` : vérifie le cycle complet d'enregistrement, le protocole AudioRecordingProviding
- [ ] **29. MeeshyErrorTests** — tous les cas d'erreur (NetworkError, AuthError, MessageError, MediaError) : vérifie errorDescription, la conformité LocalizedError, l'exhaustivité des switch
- [ ] **30. LoggingTests** — vérifie que les loggers sont correctement configurés par catégorie (network, auth, messages, media, socket)
- [ ] **31. CountryFlagTests** — `flag(for:)` : vérifie la conversion code pays → emoji drapeau pour les cas courants (FR→🇫🇷, US→🇺🇸) et les codes invalides
- [ ] **32. ThumbHashTests (SDK)** — `encode(image:)`, `decode(hash:)` : vérifie l'encodage/décodage de thumbnail hash, la taille du hash, la fidélité approximative
- [ ] **33. VideoFrameExtractorTests** — `extractFrame(from:at:)` : vérifie l'extraction de frame à un timestamp donné, le handling de vidéo invalide
- [ ] **34. PhotoLibraryManagerTests** — `requestAuthorization()`, `fetchAssets()` : vérifie la demande de permission, le fetch d'assets photo
- [ ] **35. FriendshipCacheTests** — `set(status:for:)`, `get(for:)`, `invalidate(for:)` : vérifie le cache des états d'amitié (pending, accepted, blocked, none)
- [ ] **36. UserDisplayNameCacheTests** — `set(name:for:)`, `get(for:)`, `invalidateAll()` : vérifie le cache des noms d'affichage, l'invalidation globale
- [ ] **37. StoryDraftStoreTests (SDK)** — `saveDraft()`, `loadDraft()`, `deleteDraft()`, `listDrafts()` : vérifie la persistance des brouillons de story

---

## Phase 3 — MeeshySDK : Cache avancé (10 tests)

- [ ] **38. GRDBCacheStore L1 éviction** — vérifie que le cache L1 (in-memory) évince les entrées LRU quand la taille max est atteinte, et que L2 (GRDB) conserve les données
- [ ] **39. GRDBCacheStore dirty flush** — vérifie que les clés marquées dirty sont flushées vers L2 en batch, et que le timing du flush respecte la politique
- [ ] **40. GRDBCacheStore concurrent access** — vérifie que des lectures/écritures concurrentes (via TaskGroup) ne produisent pas de data race ni de corruption
- [ ] **41. CacheCoordinator translation caching** — `cacheTranslation()`, `cachedTranslations(for:)` : vérifie le stockage et la récupération des traductions par messageId
- [ ] **42. CacheCoordinator transcription caching** — `cacheTranscription()`, `cachedTranscription(for:)` : vérifie le cache des transcriptions audio
- [ ] **43. CacheCoordinator audio translation caching** — `cacheAudioTranslation()`, `cachedAudioTranslations(for:)` : vérifie le cache des traductions audio (TTS)
- [ ] **44. DiskCacheStore size management** — vérifie que le cache disque respecte la taille max configurée, que les fichiers les plus anciens sont supprimés en premier
- [ ] **45. CachePolicy TTL expiration** — vérifie que `isExpired(storedAt:)` retourne correctement fresh/stale/expired selon les durées TTL et staleTTL configurées
- [ ] **46. CacheResult mapping** — vérifie `.map()`, `.flatMap()`, `.value` sur chaque cas (fresh/stale/expired/empty), et que `.isUsable` retourne true pour fresh et stale
- [ ] **47. OfflineQueueTests avancés** — vérifie l'enqueue pendant offline, le flush FIFO à la reconnexion, la persistance de la queue entre redémarrages, la déduplication

---

## Phase 4 — MeeshySDK : Sockets & Events (8 tests)

- [ ] **48. MessageSocketManager connect/disconnect** — vérifie le cycle connect→authenticate→joinRoom, le disconnect propre, la reconnection automatique
- [ ] **49. MessageSocketManager typing events** — vérifie l'émission et la réception de typing indicators, le debounce, le timeout d'arrêt automatique
- [ ] **50. MessageSocketManager call signaling** — vérifie le parsing des events WebRTC (call:offer, call:answer, call:ice-candidate, call:end)
- [ ] **51. MessageSocketManager transcription/translation events** — vérifie le décodage de TranscriptionReadyEvent et TranslationEvent reçus via socket
- [ ] **52. MessageSocketManager notification events** — vérifie le parsing des events notification (count, read, deleted) et la mise à jour des publishers
- [ ] **53. SocialSocketManager post events** — vérifie la réception d'events post (created, updated, deleted, liked, commented)
- [ ] **54. SocialSocketManager story events** — vérifie la réception d'events story (published, viewed, deleted)
- [ ] **55. SocialSocketManager friend events** — vérifie la réception d'events friend request (sent, accepted, declined)

---

## Phase 5 — MeeshySDK : Persistence & Database (5 tests)

- [ ] **56. AppDatabase migrations complètes** — vérifie que TOUTES les migrations s'appliquent séquentiellement sans erreur, depuis la v1 jusqu'à la dernière
- [ ] **57. AppDatabase schema validation** — vérifie que les tables attendues (cacheEntries, metadata) existent avec les bonnes colonnes après migration
- [ ] **58. CacheEntry GRDB record** — vérifie l'insertion, la lecture, la mise à jour, la suppression d'un CacheEntry, et la sérialisation/désérialisation JSON du payload
- [ ] **59. DBCacheMetadata pagination** — vérifie le stockage du cursor/offset de pagination, la mise à jour après chaque page, le reset
- [ ] **60. GRDBModels Codable** — vérifie que tous les modèles GRDB s'encodent/décodent correctement vers/depuis SQLite

---

## Phase 6 — MeeshySDK : Modèles manquants (6 tests)

- [ ] **61. AffiliateModelsTests** — vérifie le décodage JSON des tokens affiliés, stats, commissions
- [ ] **62. AgentAnalysisModelsTests** — vérifie le décodage des analyses de conversation IA (sentiment, topics, résumé)
- [ ] **63. CommunityModelsTests** — vérifie le décodage Community, CommunityMember, rôles, permissions
- [ ] **64. ShareLinkModelsTests** — vérifie le décodage ShareLink, stats de clics, expiration
- [ ] **65. VoiceProfileModelsTests** — vérifie le décodage VoiceProfile, VoiceSample, consent status
- [ ] **66. MessageEffectsTests** — vérifie le décodage des effets de message (confetti, explosion, shake), l'enum exhaustif

---

## Phase 7 — iOS App : ViewModels manquants (7 tests)

- [ ] **67. BookmarksViewModelTests** — `loadBookmarks()` success/error, `loadMore()` pagination, `removeBookmark()` supprime du tableau local, état `isLoading`
- [ ] **68. PostDetailViewModelTests** — `loadPost()`, `loadComments()` paginé, `addComment()` optimiste, `deleteComment()`, `likeComment()`, `loadReplies()` thread, `expandedThreads` toggle
- [ ] **69. EmailVerificationViewModelTests** — `verifyCode()` success/error, `resendCode()` success/cooldown, états loading/success/error
- [ ] **70. DiscoverViewModelTests** — `performSearch()` avec résultats/vide, `sendFriendRequest()` success/error, `sendInviteEmail()`, `sendInviteSMS()`, debounce de recherche
- [ ] **71. BlockedViewModelTests** — `loadBlocked()` success/empty/error, `unblock()` retire de la liste locale, `loadState` transitions
- [ ] **72. VoiceProfileManageViewModelTests** — `loadProfile()`, `toggleCloning()` enable/disable, `deleteSample()`, gestion d'état isLoading/error
- [ ] **73. VoiceProfileWizardViewModelTests** — `checkConsent()`, `grantConsent()`, `confirmAgeVerification()` avec birthDate, `uploadSamples()` progress/completion/error, navigation entre steps

---

## Phase 8 — iOS App : ViewModels existants - cas manquants (12 tests)

- [ ] **74. ConversationViewModel — recherche** — `searchMessages()` avec résultats, `searchMessages()` vide, `loadMoreSearchResults()` pagination, `clearSearch()` reset l'état
- [ ] **75. ConversationViewModel — traductions** — `preferredTranslation(for:)` résolution systemLanguage→regionalLanguage→nil, `activeTranslationOverrides` override manuelle, `translateMessage()` API call
- [ ] **76. ConversationViewModel — transcriptions** — `messageTranscriptions` cache, réception d'event socket transcription, affichage dans la bulle
- [ ] **77. ConversationViewModel — mentions** — `mentionSuggestions` mise à jour avec `activeMentionQuery`, insertion de mention dans le message
- [ ] **78. ConversationViewModel — effets** — `pendingEffects` ajout/suppression, `showEffectsPicker` toggle, `ephemeralDuration` configuration
- [ ] **79. ConversationViewModel — pin/unpin** — `pinMessage()` success/error, `unpinMessage()` success/error, mise à jour locale du message.isPinned
- [ ] **80. ConversationListViewModel — catégories** — `userCategories` chargement, `selectedFilter` filtrage, `groupedConversations` regroupement correct
- [ ] **81. ConversationListViewModel — typing** — réception de typing events, affichage du username qui tape, timeout de disparition
- [ ] **82. ConversationListViewModel — preview messages** — `previewMessages` contient le dernier message de chaque conversation, mis à jour en temps réel via socket
- [ ] **83. FeedViewModel — publish** — `publishPost()` avec texte seul, avec média, `publishError` en cas d'échec, `publishSuccess` flag
- [ ] **84. StoryViewModel — upload** — `uploadSlide()` avec image/vidéo, `activeUpload` progress, `publishStory()` multi-slides, `publishError` handling
- [ ] **85. StatusViewModel — cycle complet** — `publishStatus()` création, `updateStatus()` modification, `deleteStatus()` suppression, `loadMore()` pagination

---

## Phase 9 — iOS App : Services & Managers manquants (14 tests)

- [ ] **86. WebRTCServiceTests** — `createOffer()`, `createAnswer()`, `addIceCandidate()`, `setLocalDescription()`, `setRemoteDescription()` : vérifie le flow signaling WebRTC complet
- [ ] **87. E2ESessionManagerTests** — `createSession(with:)`, `getSession(for:)`, `deleteSession(for:)` : vérifie la gestion des sessions de chiffrement E2E par utilisateur
- [ ] **88. CallTranscriptionServiceTests** — `startTranscription()`, `stopTranscription()`, `onSegment` callback : vérifie la transcription en temps réel pendant un appel
- [ ] **89. PendingStatusQueueTests** — `enqueue(status:)`, `flush()`, `peek()`, `dequeue()` : vérifie la file d'attente FIFO des statuts en attente d'envoi
- [ ] **90. StatusBubbleControllerTests** — `show(status:)`, `dismiss()`, `isVisible` : vérifie l'affichage/masquage de la bulle de statut, le timer d'auto-dismiss
- [ ] **91. ToastManagerTests** — `show(message:type:)`, `dismiss()`, auto-dismiss après durée : vérifie les toasts success/error/info, le queueing de multiples toasts
- [ ] **92. WidgetDataManagerTests** — `updateWidgetData()`, `getLatestConversations()` : vérifie la synchronisation des données vers les widgets, le format UserDefaults(suiteName:)
- [ ] **93. VoIPPushManagerTests** — `didReceiveIncomingPush(payload:)`, `reportNewIncomingCall()` : vérifie le parsing du payload VoIP, l'intégration CallKit
- [ ] **94. BackgroundTaskManagerTests** — `scheduleRefresh()`, `handleBackgroundTask()` : vérifie la planification BGTaskScheduler, l'exécution du sync en background
- [ ] **95. ThermalStateMonitorTests** — `currentState`, `onThrottled` callback : vérifie la détection de l'état thermique, la réduction de qualité vidéo quand throttled
- [ ] **96. DarkFrameDetectorTests** — `isDarkFrame(sampleBuffer:)` : vérifie la détection de frames sombres (caméra couverte), le seuil de luminosité
- [ ] **97. MeeshyAudioProcessingModuleTests avancés** — effets audio (echo, reverb, pitch shift) appliqués correctement, bypass quand désactivé
- [ ] **98. DraftStoreTests avancés** — `saveDraft(conversationId:content:attachments:)`, `loadDraft(conversationId:)`, `deleteDraft()` : persistance avec pièces jointes, expiration
- [ ] **99. AnonymousSessionStoreTests avancés** — `createSession()`, `getSession()`, `isExpired()`, `clearSession()` : vérifie le flow session anonyme complet, l'expiration, le nettoyage

---

## Phase 10 — iOS App : Navigation & Deep Links (5 tests)

- [ ] **100. RouterTests avancés** — `push(route:)` pour TOUS les 18 cas de Route, `pop()`, `popToRoot()`, `replace(with:)` : vérifie que le NavigationPath est correctement mis à jour
- [ ] **101. DeepLinkTests avancés** — liens `meeshy://` pour chaque destination (ownProfile, userProfile, conversation, magicLink, share, userLinks, external), parsing d'URL malformée
- [ ] **102. DeepLink universal links** — `https://meeshy.me/u/{username}`, `https://meeshy.me/c/{id}`, `https://meeshy.me/magic/{token}` : vérifie le routing depuis les universal links
- [ ] **103. Navigation state restoration** — vérifie que l'état de navigation est préservé après un passage en background et retour
- [ ] **104. Tab navigation** — vérifie la navigation entre onglets (feed, conversations, contacts, profile), la préservation de l'état de chaque onglet

---

## Phase 11 — iOS App : Intégration & Flows (8 tests)

- [ ] **105. Auth flow complet** — login → stockage token Keychain → APIClient utilise le token → handleUnauthorized() → logout → token supprimé
- [ ] **106. Message send flow** — saisie texte → sendMessage() → optimistic update (message apparaît localement) → confirmation socket → message finalisé (ou rollback si erreur)
- [ ] **107. Conversation load flow** — cache-first (CacheCoordinator) → affichage immédiat si stale → API refresh en background → mise à jour silencieuse
- [ ] **108. Translation flow E2E** — message reçu → traductions cachées → preferredTranslation résout systemLanguage → affichage traduit → tap drapeau → secondaryContent affiché
- [ ] **109. Offline flow** — NetworkMonitor.isConnected = false → OfflineQueue accepte les opérations → reconnexion → flush FIFO → vérification des opérations exécutées
- [ ] **110. Friend request flow** — sendRequest() → pending dans sentRequests → acceptRequest() côté destinataire → friend ajouté des deux côtés → conversation créée
- [ ] **111. Story publish flow** — composer → ajouter slides (image/vidéo/texte) → uploadSlide() par slide → publishStory() → storyGroups mis à jour → visible dans le tray
- [ ] **112. Call flow** — initiateCall() → WebRTC offer → answer → ICE candidates échangés → call connected → toggleMute/toggleVideo → endCall() → cleanup

---

## Récapitulatif par zone

| Zone | Points | Fichiers de test à créer |
|------|--------|--------------------------|
| SDK Services manquants | 1-21 | 21 fichiers |
| SDK Infrastructure & Core | 22-37 | 16 fichiers |
| SDK Cache avancé | 38-47 | Extensions des fichiers existants |
| SDK Sockets & Events | 48-55 | Extensions des fichiers existants |
| SDK Persistence | 56-60 | Extensions + nouveaux |
| SDK Modèles manquants | 61-66 | 6 fichiers |
| App ViewModels manquants | 67-73 | 7 fichiers |
| App ViewModels cas manquants | 74-85 | Extensions des fichiers existants |
| App Services manquants | 86-99 | 14 fichiers |
| App Navigation | 100-104 | Extensions des fichiers existants |
| App Intégration | 105-112 | 8 fichiers |
| **TOTAL** | **112** | **~70 nouveaux + ~20 extensions** |

## Prérequis avant de commencer

1. **Vérifier que `./meeshy.sh test` passe** — baseline verte
2. **Créer les Mocks manquants** en premier (MockAccountService, MockAffiliateService, etc.)
3. **Ordre d'exécution recommandé** : Phase 1→2→6→3→4→5→7→8→9→10→11
4. **Chaque point = 1 fichier de test ou 1 extension** avec 3-8 test methods minimum
5. **Estimation** : ~500-700 tests unitaires au total
