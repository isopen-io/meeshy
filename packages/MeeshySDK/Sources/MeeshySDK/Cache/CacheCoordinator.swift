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
    public let friendRequests: GRDBCacheStore<String, FriendRequest>
    public let blockedUsers: GRDBCacheStore<String, BlockedUser>
    public let userSearch: GRDBCacheStore<String, UserSearchResult>
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

    /// Configures memory caps for the image pipeline. Call once at app launch.
    ///
    /// Sets:
    /// - The decoded UIImage cache (NSCache in `DiskCacheStore.images`) at the
    ///   given byte limit, used by `CachedAsyncImage` and `ProgressiveCachedImage`.
    /// - The decoded CGImage cache (`DecodedImageCache.shared`) proportionally —
    ///   we leave 5/6 of the budget for UIImages (more frequent) and 1/6 for
    ///   CGImages (used by full-screen viewers).
    ///
    /// - Parameter budgetBytes: Total budget for both decoded image caches combined.
    ///   Recommended: 60 MB on iPhone, 100 MB on iPad.
    nonisolated public static func configureImageMemory(budgetBytes: Int) {
        let uiImageCap = (budgetBytes * 5) / 6
        let cgImageCap = budgetBytes / 6
        DiskCacheStore.configureImageCache(memoryCostLimitBytes: uiImageCap)
        DecodedImageCache.shared.setTotalCostLimit(cgImageCap)
    }

    // MARK: - In-Memory Translation/Transcription/Audio Caches (keyed by messageId)

    private static let maxTranslationCacheEntries = 500

    private var translationCache: [String: [TranslationData]] = [:]
    private var translationTimestamps: [String: Date] = [:]
    private var translationInsertionOrder: [String] = []
    /// Translations older than this are dropped at read time so stale
    /// machine output (model updates, content edits that the server
    /// hasn't reconciled yet, etc.) doesn't linger indefinitely in RAM.
    /// Matches the `messages` cache `staleTTL` window roughly.
    private static let translationMaxAge: TimeInterval = 24 * 3600
    private var transcriptionCache: [String: TranscriptionReadyEvent] = [:]
    private var transcriptionInsertionOrder: [String] = []
    private var audioTranslationCache: [String: [AudioTranslationEvent]] = [:]
    private var audioTranslationInsertionOrder: [String] = []


    public func cachedTranslations(for messageId: String) -> [TranslationData]? {
        // TTL enforcement on read: if the entry is older than 24h, drop it so
        // we don't serve stale machine output when a better translation could
        // be produced on demand.
        if let stamp = translationTimestamps[messageId],
           Date().timeIntervalSince(stamp) > Self.translationMaxAge {
            translationCache.removeValue(forKey: messageId)
            translationTimestamps.removeValue(forKey: messageId)
            if let idx = translationInsertionOrder.firstIndex(of: messageId) {
                translationInsertionOrder.remove(at: idx)
            }
            return nil
        }
        return translationCache[messageId]
    }

    public func cachedTranslations(for messageIds: [String]) -> [String: [TranslationData]] {
        var result: [String: [TranslationData]] = [:]
        for msgId in messageIds {
            if let translations = cachedTranslations(for: msgId) {
                result[msgId] = translations
            }
        }
        return result
    }

    public func cachedTranscription(for messageId: String) -> TranscriptionReadyEvent? {
        transcriptionCache[messageId]
    }

    public func cachedAudioTranslations(for messageId: String) -> [AudioTranslationEvent]? {
        audioTranslationCache[messageId]
    }

    private let messageSocket: any MessageSocketProviding
    private let socialSocket: any SocialSocketProviding
    nonisolated let db: any DatabaseWriter
    private var cancellables = Set<AnyCancellable>()
    private var lifecycleObservers: [NSObjectProtocol] = []
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
        self.db = db

        self.conversations = GRDBCacheStore(policy: .conversations, db: db, namespace: "conv", encrypted: true)
        self.messages = GRDBCacheStore(policy: .messages, db: db, namespace: "msg", encrypted: true)
        self.participants = GRDBCacheStore(policy: .participants, db: db, namespace: "part")
        self.profiles = GRDBCacheStore(policy: .userProfiles, db: db, namespace: "prof", encrypted: true)
        self.feed = GRDBCacheStore(policy: .feedPosts, db: db, namespace: "feed")
        self.comments = GRDBCacheStore(policy: .comments, db: db, namespace: "comments")
        self.stories = GRDBCacheStore(policy: .stories, db: db, namespace: "stories")
        self.stats = GRDBCacheStore(policy: .userStats, db: db, namespace: "stats")
        self.notifications = GRDBCacheStore(policy: .notifications, db: db, namespace: "notif", encrypted: true)
        self.affiliateTokens = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "affil")
        self.shareLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "slinks")
        self.trackingLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "tlinks")
        self.communityLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "clinks")
        self.statuses = GRDBCacheStore(policy: .statuses, db: db, namespace: "statuses")
        self.friends = GRDBCacheStore(policy: .participants, db: db, namespace: "friends")
        self.friendRequests = GRDBCacheStore(policy: .participants, db: db, namespace: "freq", encrypted: true)
        self.blockedUsers = GRDBCacheStore(policy: .participants, db: db, namespace: "blocked", encrypted: true)
        self.userSearch = GRDBCacheStore(policy: .userProfiles, db: db, namespace: "usearch")
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
        Task { await self.backfillSearchIndexIfNeeded() }
    }

    // MARK: - Search Index Backfill

    /// Seeds the FTS5 conversations index from the cache the first time we
    /// boot a user that has cached data already. Gated by a UserDefaults
    /// flag so subsequent cold starts skip the work — the per-save hooks
    /// keep the index live afterwards. Users are NOT backfilled here because
    /// the `.profiles` store is keyed per-user (no canonical "list" key);
    /// they get indexed naturally as the user navigates and `UserProfileViewModel`
    /// calls `SearchIndex.shared.indexUsers` after each fetch.
    private func backfillSearchIndexIfNeeded() async {
        let key = "meeshy.searchindex.backfillDone.v1"
        guard !UserDefaults.standard.bool(forKey: key) else { return }

        if let cachedConversations = await conversations.load(for: "list").value,
           !cachedConversations.isEmpty {
            await SearchIndex.shared.indexConversations(cachedConversations)
        }

        UserDefaults.standard.set(true, forKey: key)
    }

    /// Tear the coordinator down after logout/account-switch so a subsequent
    /// login can re-run `start()` from a clean slate. This MUST also purge
    /// every disk-backed store (GRDB tables + on-disk media files) because
    /// the stores are NOT namespaced by userId — leaving them populated
    /// would expose user A's cached conversations/messages/profiles to a
    /// user B who logs in next on the same device. Memory caches and
    /// lifecycle subscriptions are also reset so `MeeshyApp.task` only
    /// runs once per view lifecycle while `onChange(isAuth:)` is the
    /// re-init entry point.
    public func reset() async {
        // 1. Purge everything on disk first so a concurrent reader on the
        //    other side of the actor hop sees an empty cache (no stale
        //    entries from the previous user).
        await conversations.invalidateAll()
        await messages.invalidateAll()
        await participants.invalidateAll()
        await profiles.invalidateAll()
        await feed.invalidateAll()
        await comments.invalidateAll()
        await stories.invalidateAll()
        await stats.invalidateAll()
        await notifications.invalidateAll()
        await affiliateTokens.invalidateAll()
        await shareLinks.invalidateAll()
        await trackingLinks.invalidateAll()
        await communityLinks.invalidateAll()
        await statuses.invalidateAll()
        await friends.invalidateAll()
        await friendRequests.invalidateAll()
        await blockedUsers.invalidateAll()
        await userSearch.invalidateAll()
        await timeline.invalidateAll()
        await images.invalidateAll()
        await audio.invalidateAll()
        await video.invalidateAll()
        await thumbnails.invalidateAll()
        await UserColorCache.shared.invalidateAll()
        await SearchIndex.shared.clearAll()
        // No translation persist task to cancel — persistence is now incremental
        clearTranslationCacheDB()

        // Reset the search-index backfill flag so the next user's first
        // `start()` re-runs the backfill against their freshly hydrated cache.
        UserDefaults.standard.removeObject(forKey: "meeshy.searchindex.backfillDone.v1")

        // 2. Tear down the coordinator state so the next `start()` re-arms.
        isStarted = false
        cancellables.removeAll()
        for observer in lifecycleObservers {
            NotificationCenter.default.removeObserver(observer)
        }
        lifecycleObservers.removeAll()
        currentUserId = ""
        translationCache.removeAll()
        translationInsertionOrder.removeAll()
        translationTimestamps.removeAll()
        transcriptionCache.removeAll()
        transcriptionInsertionOrder.removeAll()
        audioTranslationCache.removeAll()
        audioTranslationInsertionOrder.removeAll()
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
        // Stamp/refresh the age marker so the TTL reset on every new
        // broadcast — server-pushed updates keep the entry hot.
        translationTimestamps[msgId] = Date()
        if isNew {
            translationInsertionOrder.append(msgId)
            evictTranslationCacheIfNeeded()
        }
        // Persist this specific translation immediately (incremental, not full rewrite)
        persistTranslationIncremental(messageId: msgId, translations: existing, cachedAt: translationTimestamps[msgId] ?? Date())
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
            translationTimestamps.removeValue(forKey: oldest)
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

    private func subscribeToLifecycle() {
        #if canImport(UIKit)
        let resign = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.flushAll() }
        }

        // `willResignActive` fires for brief pre-backgrounding hand-offs
        // (control center, incoming call) but NOT reliably on full
        // background → terminate. We also observe `didEnterBackground`
        // explicitly so dirty cache keys reach disk before the OS freezes
        // the process, and `willTerminate` as the last-chance hook.
        let background = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.flushAll() }
        }

        let terminate = NotificationCenter.default.addObserver(
            forName: UIApplication.willTerminateNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            // Terminate is synchronous from the OS perspective: we have ~5s
            // before the process is killed. Hop into the actor and wait up
            // to 4s for the flush to complete so critical writes land on
            // disk. If the wait times out we still release — the OS will
            // kill us either way, but we maximise persistence.
            let semaphore = DispatchSemaphore(value: 0)
            Task.detached {
                await self.flushAll()
                semaphore.signal()
            }
            _ = semaphore.wait(timeout: .now() + 4)
        }

        let memory = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.evictUnderMemoryPressure() }
        }
        lifecycleObservers = [resign, background, terminate, memory]
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
        translationTimestamps.removeAll()
        transcriptionCache.removeAll()
        transcriptionInsertionOrder.removeAll()
        audioTranslationCache.removeAll()
        audioTranslationInsertionOrder.removeAll()

        logger.info("Memory pressure — flushed dirty keys, evicted L1 caches and expired media")
    }

    // MARK: - Translation Cache Persistence

    private func persistTranslationIncremental(messageId: String, translations: [TranslationData], cachedAt: Date) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        do {
            try db.write { db in
                // Delete existing records for this message, then insert fresh
                try TranslationCacheRecord
                    .filter(Column("messageId") == messageId)
                    .deleteAll(db)
                for translation in translations {
                    let data = try encoder.encode(translation)
                    let record = TranslationCacheRecord(
                        messageId: messageId,
                        targetLanguage: translation.targetLanguage,
                        encodedData: data,
                        cachedAt: cachedAt
                    )
                    try record.save(db)
                }
            }
        } catch {
            logger.error("Failed to persist translation for \(messageId): \(error)")
        }
    }

    private func persistTranslationCaches() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let snapshot = translationCache
        let timestamps = translationTimestamps
        do {
            try db.write { db in
                try TranslationCacheRecord.deleteAll(db)
                let now = Date()
                for (msgId, translations) in snapshot {
                    let cachedAt = timestamps[msgId] ?? now
                    for translation in translations {
                        let data = try encoder.encode(translation)
                        let record = TranslationCacheRecord(
                            messageId: msgId,
                            targetLanguage: translation.targetLanguage,
                            encodedData: data,
                            cachedAt: cachedAt
                        )
                        try record.save(db)
                    }
                }
            }
        } catch {
            logger.error("Failed to persist translation cache to GRDB: \(error)")
        }
    }

    private func loadTranslationCaches() {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let cutoff = Date().addingTimeInterval(-Self.translationMaxAge)
        do {
            let records: [TranslationCacheRecord] = try db.read { db in
                try TranslationCacheRecord
                    .filter(Column("cachedAt") > cutoff)
                    .fetchAll(db)
            }
            var loaded: [String: [TranslationData]] = [:]
            var stamps: [String: Date] = [:]
            var order: [String] = []
            for record in records {
                let translation = try decoder.decode(TranslationData.self, from: record.encodedData)
                loaded[record.messageId, default: []].append(translation)
                if stamps[record.messageId] == nil {
                    stamps[record.messageId] = record.cachedAt
                    order.append(record.messageId)
                }
            }
            translationCache = loaded
            translationTimestamps = stamps
            translationInsertionOrder = order
        } catch {
            logger.error("Failed to load translation cache from GRDB: \(error)")
        }
        logger.info("Loaded translation caches: \(self.translationCache.count) translations, \(self.transcriptionCache.count) transcriptions, \(self.audioTranslationCache.count) audio translations")

        // One-time cleanup: remove legacy UserDefaults keys
        UserDefaults.standard.removeObject(forKey: "meeshy_cache_translations")
        UserDefaults.standard.removeObject(forKey: "meeshy_cache_transcriptions")
        UserDefaults.standard.removeObject(forKey: "meeshy_cache_audio_translations")
    }

    public func invalidateAll() async {
        await conversations.invalidateAll()
        await messages.invalidateAll()
        await participants.invalidateAll()
        await profiles.invalidateAll()
        await feed.invalidateAll()
        await stories.invalidateAll()
        await friendRequests.invalidateAll()
        await blockedUsers.invalidateAll()
        await userSearch.invalidateAll()
        await images.invalidateAll()
        await audio.invalidateAll()
        await video.invalidateAll()
        await thumbnails.invalidateAll()
        await UserColorCache.shared.invalidateAll()
        translationCache.removeAll()
        translationInsertionOrder.removeAll()
        translationTimestamps.removeAll()
        transcriptionCache.removeAll()
        transcriptionInsertionOrder.removeAll()
        audioTranslationCache.removeAll()
        audioTranslationInsertionOrder.removeAll()
        clearTranslationCacheDB()
    }

    private nonisolated func clearTranslationCacheDB() {
        try? db.write { db in try TranslationCacheRecord.deleteAll(db) }
    }
}
