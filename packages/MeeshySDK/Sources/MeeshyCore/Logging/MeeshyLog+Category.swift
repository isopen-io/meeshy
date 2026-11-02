public extension MeeshyLog {
    enum Category: String, Sendable, CaseIterable {
        case network
        case auth
        case messages
        case media
        case socket
        case cache
        case ui
        case pip
        case grdb
        case attachmentStatus = "AttachmentStatus"
        case affiliate
        case analytics
        case anonSession = "anon-session"
        case attachmentPrep = "attachment-prep"
        case audioCoordinator = "audio-coordinator"
        case audioEditor = "audio-editor"
        case audioPlayback = "audio-playback"
        case audioRecorder = "audio-recorder"
        case audioSession = "audio-session"
        case background
        case backgroundTransition = "background-transition"
        case cacheAccounts = "cache-accounts"
        case cacheBgFlush = "cache-bg-flush"
        case cacheCoordinator = "cache-coordinator"
        case cachePolicy = "cache-policy"
        case cachePurge = "cache-purge"
        case callControls = "call-controls"
        case callDecline = "call-decline"
        case callLiveFrame = "call-live-frame"
        case callMontageRecording = "call-montage-recording"
        case callRecording = "call-recording"
        case callSounds = "call-sounds"
        case calls
        case captureShield = "capture-shield"
        case commentIngest = "comment-ingest"
        case commentSend = "comment-send"
        case commentSheetFit = "comment-sheet-fit"
        case community
        case composer
        case composerAutosave = "composer-autosave"
        case composerDrop = "composer-drop"
        case composerPaste = "composer-paste"
        case composerSceneExport = "composer-scene-export"
        case contactSync = "contact-sync"
        case contentCapture = "content-capture"
        case contentOpen = "content-open"
        case convOptions = "conv-options"
        case conversationCard = "conversation-card"
        case conversationCommands = "conversation-commands"
        case conversationEncryption = "conversation-encryption"
        case conversationInfo = "conversation-info"
        case conversationStateOutbox = "conversation-state-outbox"
        case crash
        case dbEncryption = "db-encryption"
        case dbMaintenance = "db-maintenance"
        case dependencyContainer = "dependency-container"
        case deviceTranslation = "device-translation"
        case diskCache = "disk-cache"
        case draftStore = "draft-store"
        case drafts
        case e2ee
        case editHistory = "edit-history"
        case engagement
        case engagementOutbox = "engagement-outbox"
        case feedPersistence = "feed-persistence"
        case firstRenderWarmup = "first-render-warmup"
        case focusFilter = "focus-filter"
        case friendshipCache = "friendship-cache"
        case game
        case grdbCacheStore = "grdb-cache-store"
        case grdbSuspension = "grdb-suspension"
        case impressions
        case keychain
        case launch
        case linkPreview = "link-preview"
        case liveActivity = "live-activity"
        case location
        case locationThumbnail = "location-thumbnail"
        case lottieFilm = "lottie-film"
        case magicLink = "magic-link"
        case mediaAutosave = "media-autosave"
        case mediaBranding = "media-branding"
        case mediaCompressor = "media-compressor"
        case mediaFileDownload = "media-file-download"
        case mediaHub = "media-hub"
        case mediaIndex = "media-index"
        case mediaSave = "media-save"
        case messageStoreRouter = "message-store-router"
        case messageStoreSession = "message-store-session"
        case metricsSubscriber = "metrics-subscriber"
        case moodSpotlight = "mood-spotlight"
        case navigation
        case nearby
        case nearbyCache = "nearby-cache"
        case nearbyDecode = "nearby-decode"
        case notifResync = "notif-resync"
        case notificationCoordinator = "notification-coordinator"
        case notifications
        case nowPlaying = "now-playing"
        case nseConsumer = "nse-consumer"
        case nseDatasync = "nse-datasync"
        case nsePostConsumer = "nse-post-consumer"
        case nsePosts = "nse-posts"
        case nsePrefsGate = "nse-prefs-gate"
        case offlinequeue
        case onboarding
        case outboxDispatcher = "outbox-dispatcher"
        case outboxFlusher = "outbox-flusher"
        case packs
        case participantService = "participant-service"
        case participants
        case pendingStatus = "pending-status"
        case phonebook
        case photoLibrary = "photo-library"
        case player
        case presence
        case profile
        case publicationCancel = "publication-cancel"
        case push
        case pushReceipt = "push-receipt"
        case reelsPerf = "reels-perf"
        case requests
        case retention
        case router
        case screenShare = "screen-share"
        case searchindex
        case sessionSnapshot = "session-snapshot"
        case settings
        case settingsactionqueue
        case shareCompose = "share-compose"
        case shareConsumer = "share-consumer"
        case shareExtension = "share-extension"
        case signInLink = "sign-in-link"
        case socialEventsV2 = "social-events-v2"
        case socialEventsV2Outbox = "social-events-v2-outbox"
        case starredStore = "starred-store"
        case stats
        case statusBubble = "status-bubble"
        case stickerLibrary = "sticker-library"
        case stickerNearby = "sticker-nearby"
        case stories
        case storyAudio = "story-audio"
        case storyExportShare = "story-export-share"
        case storyMedia = "story-media"
        case storyOfflineQueue = "story-offline-queue"
        case storyPublishQueue = "story-publish-queue"
        case storyPublishSanitizer = "story-publish-sanitizer"
        case storyPublishService = "story-publish-service"
        case storyQueueMigrator = "story-queue-migrator"
        case storyTimelineExport = "story-timeline-export"
        case storyInteraction = "story.interaction"
        case stuckPublicationRetry = "stuck-publication-retry"
        case sync
        case testNetworkSeal = "test-network-seal"
        case tlsPinning = "tls-pinning"
        case tusCheckpoint = "tus-checkpoint"
        case tusUpload = "tus-upload"
        case visitorReach = "visitor-reach"
        case voiceNoteTranscriber = "voice-note-transcriber"
        case voipPush = "voip-push"
        case voipToken = "voip-token"
        case webrtc
        case widgetData = "widget-data"
        case widgetFlusher = "widget-flusher"
    }
}
