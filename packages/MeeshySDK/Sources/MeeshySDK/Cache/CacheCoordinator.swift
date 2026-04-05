import Foundation
import Combine
import GRDB
import UIKit
import os

public actor CacheCoordinator {
    public static let shared = CacheCoordinator()

    public let conversations: GRDBCacheStore<String, MeeshyConversation>
    public let messages: GRDBCacheStore<String, MeeshyMessage>
    public let participants: GRDBCacheStore<String, PaginatedParticipant>
    public let profiles: GRDBCacheStore<String, MeeshyUser>
    public let feed: GRDBCacheStore<String, FeedPost>
    public let comments: GRDBCacheStore<String, FeedComment>
    public let stories: GRDBCacheStore<String, StoryGroup>
    public let stats: GRDBCacheStore<String, UserStats>
    public let notifications: GRDBCacheStore<String, APINotification>
    public let affiliateTokens: GRDBCacheStore<String, AffiliateToken>
    public let shareLinks: GRDBCacheStore<String, MyShareLink>
    public let trackingLinks: GRDBCacheStore<String, TrackingLink>
    public let communityLinks: GRDBCacheStore<String, CommunityLink>
    public let statuses: GRDBCacheStore<String, StatusEntry>
    public let friends: GRDBCacheStore<String, FriendRequestUser>
    public let timeline: GRDBCacheStore<String, TimelinePoint>

    public let images: DiskCacheStore
    public let audio: DiskCacheStore
    public let video: DiskCacheStore
    public let thumbnails: DiskCacheStore

    // MARK: - Synchronous Media Cache Access (nonisolated — no actor hop)

    /// Check video disk cache synchronously. Returns local file URL if cached.
    nonisolated public static func videoLocalFileURL(for urlString: String) -> URL? {
        shared.video.cachedFileURL(for: urlString)
    }

    /// Check audio disk cache synchronously. Returns local file URL if cached.
    nonisolated public static func audioLocalFileURL(for urlString: String) -> URL? {
        shared.audio.cachedFileURL(for: urlString)
    }

    /// Check image disk cache synchronously. Returns cached UIImage if available.
    nonisolated public static func cachedImage(for urlString: String) -> UIImage? {
        DiskCacheStore.cachedImage(for: urlString)
    }

    // MARK: - In-Memory Translation/Transcription/Audio Caches (keyed by messageId)

    private static let maxTranslationCacheEntries = 500

    private var translationCache: [String: [TranslationData]] = [:]
    private var translationInsertionOrder: [String] = []
    private var transcriptionCache: [String: TranscriptionReadyEvent] = [:]
    private var transcriptionInsertionOrder: [String] = []
    private var audioTranslationCache: [String: [AudioTranslationEvent]] = [:]
    private var audioTranslationInsertionOrder: [String] = []

    public func cachedTranslations(for messageId: String) -> [TranslationData]? {
        translationCache[messageId]
    }

    public func cachedTranscription(for messageId: String) -> TranscriptionReadyEvent? {
        transcriptionCache[messageId]
    }

    public func cachedAudioTranslations(for messageId: String) -> [AudioTranslationEvent]? {
        audioTranslationCache[messageId]
    }

    private let messageSocket: any MessageSocketProviding
    private let socialSocket: any SocialSocketProviding
    private var cancellables = Set<AnyCancellable>()
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "cache-coordinator")
    private var isStarted = false
    private var currentUserId: String = ""

    public init(
        messageSocket: any MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: any SocialSocketProviding = SocialSocketManager.shared,
        db: any DatabaseWriter = AppDatabase.shared.databaseWriter
    ) {
        self.messageSocket = messageSocket
        self.socialSocket = socialSocket

        self.conversations = GRDBCacheStore(policy: .conversations, db: db, namespace: "conv")
        self.messages = GRDBCacheStore(policy: .messages, db: db, namespace: "msg")
        self.participants = GRDBCacheStore(policy: .participants, db: db, namespace: "part")
        self.profiles = GRDBCacheStore(policy: .userProfiles, db: db, namespace: "prof")
        self.feed = GRDBCacheStore(policy: .feedPosts, db: db, namespace: "feed")
        self.comments = GRDBCacheStore(policy: .comments, db: db, namespace: "comments")
        self.stories = GRDBCacheStore(policy: .stories, db: db, namespace: "stories")
        self.stats = GRDBCacheStore(policy: .userStats, db: db, namespace: "stats")
        self.notifications = GRDBCacheStore(policy: .notifications, db: db, namespace: "notif")
        self.affiliateTokens = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "affil")
        self.shareLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "slinks")
        self.trackingLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "tlinks")
        self.communityLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "clinks")
        self.statuses = GRDBCacheStore(policy: .statuses, db: db, namespace: "statuses")
        self.friends = GRDBCacheStore(policy: .participants, db: db, namespace: "friends")
        self.timeline = GRDBCacheStore(policy: .userStats, db: db, namespace: "timeline")

        self.images = DiskCacheStore(policy: .mediaImages)
        self.audio = DiskCacheStore(policy: .mediaAudio)
        self.video = DiskCacheStore(policy: .mediaVideo)
        self.thumbnails = DiskCacheStore(policy: .thumbnails)
    }

    public func start() {
        guard !isStarted else { return }
        isStarted = true
        resolveCurrentUserId()
        loadTranslationCaches()
        subscribeToLifecycle()
    }

    private func resolveCurrentUserId() {
        Task { @MainActor in
            if let userId = AuthManager.shared.currentUser?.id {
                await self.setCurrentUserId(userId)
            }
        }
    }

    private func setCurrentUserId(_ id: String) {
        currentUserId = id
    }

    // MARK: - Public Cache Methods (called by ConversationSyncEngine)

    public func cacheTranslation(_ event: TranslationEvent) {
        let msgId = event.messageId
        var existing = translationCache[msgId] ?? []
        let isNew = translationCache[msgId] == nil
        for translation in event.translations {
            if let idx = existing.firstIndex(where: { $0.targetLanguage == translation.targetLanguage }) {
                existing[idx] = translation
            } else {
                existing.append(translation)
            }
        }
        translationCache[msgId] = existing
        if isNew {
            translationInsertionOrder.append(msgId)
            evictTranslationCacheIfNeeded()
        }
    }

    public func cacheTranscription(_ event: TranscriptionReadyEvent) {
        let isNew = transcriptionCache[event.messageId] == nil
        transcriptionCache[event.messageId] = event
        if isNew {
            transcriptionInsertionOrder.append(event.messageId)
            evictTranscriptionCacheIfNeeded()
        }
    }

    public func cacheAudioTranslation(_ event: AudioTranslationEvent) {
        let msgId = event.messageId
        var existing = audioTranslationCache[msgId] ?? []
        let isNew = audioTranslationCache[msgId] == nil
        if let idx = existing.firstIndex(where: { $0.translatedAudio.targetLanguage == event.translatedAudio.targetLanguage }) {
            existing[idx] = event
        } else {
            existing.append(event)
        }
        audioTranslationCache[msgId] = existing
        if isNew {
            audioTranslationInsertionOrder.append(msgId)
            evictAudioTranslationCacheIfNeeded()
        }
    }

    private func evictTranslationCacheIfNeeded() {
        while translationCache.count > Self.maxTranslationCacheEntries, let oldest = translationInsertionOrder.first {
            translationInsertionOrder.removeFirst()
            translationCache.removeValue(forKey: oldest)
        }
    }

    private func evictTranscriptionCacheIfNeeded() {
        while transcriptionCache.count > Self.maxTranslationCacheEntries, let oldest = transcriptionInsertionOrder.first {
            transcriptionInsertionOrder.removeFirst()
            transcriptionCache.removeValue(forKey: oldest)
        }
    }

    private func evictAudioTranslationCacheIfNeeded() {
        while audioTranslationCache.count > Self.maxTranslationCacheEntries, let oldest = audioTranslationInsertionOrder.first {
            audioTranslationInsertionOrder.removeFirst()
            audioTranslationCache.removeValue(forKey: oldest)
        }
    }

    // MARK: - Lifecycle

    private nonisolated func subscribeToLifecycle() {
        #if canImport(UIKit)
        NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.flushAll() }
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.evictUnderMemoryPressure() }
        }
        #endif
    }

    public func flushAll() async {
        await conversations.flushDirtyKeys()
        await messages.flushDirtyKeys()
        await participants.flushDirtyKeys()
        await profiles.flushDirtyKeys()
        await feed.flushDirtyKeys()
        await stories.flushDirtyKeys()
        persistTranslationCaches()
    }

    public func evictUnderMemoryPressure() async {
        await conversations.flushDirtyKeys()
        await messages.flushDirtyKeys()
        await participants.flushDirtyKeys()
        await profiles.flushDirtyKeys()
        await feed.flushDirtyKeys()
        await stories.flushDirtyKeys()

        await conversations.evictL1()
        await messages.evictL1()
        await participants.evictL1()
        await profiles.evictL1()
        await feed.evictL1()
        await stories.evictL1()

        await images.evictExpired()
        await audio.evictExpired()
        await video.evictExpired()
        await thumbnails.evictExpired()

        translationCache.removeAll()
        translationInsertionOrder.removeAll()
        transcriptionCache.removeAll()
        transcriptionInsertionOrder.removeAll()
        audioTranslationCache.removeAll()
        audioTranslationInsertionOrder.removeAll()

        logger.info("Memory pressure — flushed dirty keys, evicted L1 caches and expired media")
    }

    // MARK: - Translation Cache Persistence

    private static let translationCacheKey = "meeshy_cache_translations"
    private static let transcriptionCacheKey = "meeshy_cache_transcriptions"
    private static let audioTranslationCacheKey = "meeshy_cache_audio_translations"

    private func persistTranslationCaches() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(translationCache) {
            UserDefaults.standard.set(data, forKey: Self.translationCacheKey)
        }
        if let data = try? encoder.encode(transcriptionCache) {
            UserDefaults.standard.set(data, forKey: Self.transcriptionCacheKey)
        }
        if let data = try? encoder.encode(audioTranslationCache) {
            UserDefaults.standard.set(data, forKey: Self.audioTranslationCacheKey)
        }
    }

    private func loadTranslationCaches() {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let data = UserDefaults.standard.data(forKey: Self.translationCacheKey),
           let decoded = try? decoder.decode([String: [TranslationData]].self, from: data) {
            translationCache = decoded
        }
        if let data = UserDefaults.standard.data(forKey: Self.transcriptionCacheKey),
           let decoded = try? decoder.decode([String: TranscriptionReadyEvent].self, from: data) {
            transcriptionCache = decoded
        }
        if let data = UserDefaults.standard.data(forKey: Self.audioTranslationCacheKey),
           let decoded = try? decoder.decode([String: [AudioTranslationEvent]].self, from: data) {
            audioTranslationCache = decoded
        }
        logger.info("Loaded translation caches: \(self.translationCache.count) translations, \(self.transcriptionCache.count) transcriptions, \(self.audioTranslationCache.count) audio translations")
    }

    public func invalidateAll() async {
        await conversations.invalidateAll()
        await messages.invalidateAll()
        await participants.invalidateAll()
        await profiles.invalidateAll()
        await feed.invalidateAll()
        await stories.invalidateAll()
        await images.invalidateAll()
        await audio.invalidateAll()
        await video.invalidateAll()
        await thumbnails.invalidateAll()
        await UserColorCache.shared.invalidateAll()
        translationCache.removeAll()
        translationInsertionOrder.removeAll()
        transcriptionCache.removeAll()
        transcriptionInsertionOrder.removeAll()
        audioTranslationCache.removeAll()
        audioTranslationInsertionOrder.removeAll()
        UserDefaults.standard.removeObject(forKey: Self.translationCacheKey)
        UserDefaults.standard.removeObject(forKey: Self.transcriptionCacheKey)
        UserDefaults.standard.removeObject(forKey: Self.audioTranslationCacheKey)
    }
}
