import Foundation
import Combine
import GRDB
import UIKit
#if canImport(BackgroundTasks)
import BackgroundTasks
#endif
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
    /// User communities list (the ones the current user is a member of).
    /// Single key "list" stores the full ordered set; the conversation list
    /// pulls from here cache-first so the Communities section renders
    /// instantly on cold start instead of flashing through an empty state
    /// while `/communities` round-trips the network.
    public let communities: GRDBCacheStore<String, APICommunity>
    /// Per-conversation message drafts. Key = conversationId, value = a single
    /// `ConversationDraft` (wrapped in a single-element array to fit the
    /// `GRDBCacheStore` `[Value]` shape). Local-only — drafts are never
    /// synced to the server, so the cache IS the source of truth. Reads
    /// always hit the `.fresh` branch (see `CachePolicy.drafts`).
    public let drafts: GRDBCacheStore<String, ConversationDraft>
    /// Local-only call transcripts — never sent to the Meeshy server. See
    /// `CachePolicy.callTranscripts`.
    public let callTranscripts: GRDBCacheStore<String, CallTranscript>
    public let statuses: GRDBCacheStore<String, StatusEntry>
    public let friends: GRDBCacheStore<String, FriendRequestUser>
    public let friendRequests: GRDBCacheStore<String, FriendRequest>
    public let blockedUsers: GRDBCacheStore<String, BlockedUser>
    public let userSearch: GRDBCacheStore<String, UserSearchResult>
    /// Répertoire — carnet d'adresses synchronisé. Chiffré : ce sont les
    /// contacts de l'utilisateur, la donnée la plus personnelle du cache.
    public let phonebook: GRDBCacheStore<String, DirectoryContact>
    /// Filleuls de l'affiliation (onglet « Affilies » de l'annuaire).
    public let affiliates: GRDBCacheStore<String, AffiliateReferral>
    public let callHistory: GRDBCacheStore<String, APICallRecord>
    public let timeline: GRDBCacheStore<String, TimelinePoint>
    /// User-defined conversation categories. Single key "list" stores the full
    /// ordered set (typically <20 items). Stale-while-revalidate via
    /// PreferenceService.loadCachedCategories so the conversation list shows
    /// the right section grouping instantly on cold start instead of flashing
    /// "Other" until the network fetch lands.
    public let categories: GRDBCacheStore<String, ConversationCategory>
    /// Distinct user-curated tags across all conversations. Single key "list".
    public let userTags: GRDBCacheStore<String, ConversationTagEntry>
    /// Top-level user preferences blob (translation prefs, theme, etc.).
    /// Single key "all" stores the wrapped UserPreferences.
    public let userPreferences: GRDBCacheStore<String, PreferenceValue<UserPreferences>>
    /// Per-conversation user preferences (pin / mute / archive / customName /
    /// tags / categoryId / mentionsOnly / reaction). Keyed by conversationId
    /// so a sheet open hits the cache instantly while a background revalidate
    /// keeps it fresh.
    public let conversationPreferences: GRDBCacheStore<String, PreferenceValue<APIConversationPreferences>>

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

    /// Variante async de `videoLocalFileURL` qui garantit un retour `file://`.
    /// 1) Retourne immédiatement si l'URL est déjà file:// ou si le cache disk est chaud.
    /// 2) Sinon, déclenche un fetch via `video.data(for:)` puis retourne l'URL locale produite.
    /// 3) Retourne `nil` si tout échoue (réseau down, fichier corrompu, etc.).
    ///
    /// Garantit que le caller peut passer le résultat à `AVPlayer(url:)` /
    /// `AVAudioFile(forReading:)` sans risque de rejet HTTPS.
    nonisolated public static func videoLocalFileURLAwait(for remote: URL) async -> URL? {
        if remote.isFileURL { return remote }
        if let cached = videoLocalFileURL(for: remote.absoluteString) { return cached }
        do {
            _ = try await shared.video.data(for: remote.absoluteString)
        } catch {
            // Le retour `nil` ci-dessous suffit à l'appelant, mais sans trace
            // un échec réseau est indiscernable d'un fichier absent.
            Logger.cache.error("Video prefetch failed before local-URL resolution: \(error.localizedDescription, privacy: .public)")
        }
        return videoLocalFileURL(for: remote.absoluteString)
    }

    /// Idem pour l'audio. Utilisé par le hotfix audio reader (cf. spec
    /// `2026-05-20-stories-audio-hotfix-design.md` § 5.7).
    nonisolated public static func audioLocalFileURLAwait(for remote: URL) async -> URL? {
        if remote.isFileURL { return remote }
        if let cached = audioLocalFileURL(for: remote.absoluteString) { return cached }
        do {
            _ = try await shared.audio.data(for: remote.absoluteString)
        } catch {
            // Le retour `nil` ci-dessous suffit à l'appelant, mais sans trace
            // un échec réseau est indiscernable d'un fichier absent.
            Logger.cache.error("Audio prefetch failed before local-URL resolution: \(error.localizedDescription, privacy: .public)")
        }
        return audioLocalFileURL(for: remote.absoluteString)
    }

    /// Idem pour l'image. Utilisé par l'export MP4 de story, qui doit disposer
    /// d'un `file://` : son compositor décode le fond frame par frame, sur le
    /// main actor et de façon SYNCHRONE — il ne peut donc rien télécharger
    /// lui-même. `StoryExporter` résout tous les visuels par ici AVANT de
    /// composer.
    nonisolated public static func imageLocalFileURLAwait(for remote: URL) async -> URL? {
        if remote.isFileURL { return remote }
        if let cached = imageLocalFileURL(for: remote.absoluteString) { return cached }
        do {
            _ = try await shared.images.data(for: remote.absoluteString)
        } catch {
            Logger.cache.error("Image prefetch failed before local-URL resolution: \(error.localizedDescription, privacy: .public)")
        }
        return imageLocalFileURL(for: remote.absoluteString)
    }

    /// Check image disk cache synchronously. Returns cached UIImage if available.
    nonisolated public static func cachedImage(for urlString: String) -> UIImage? {
        DiskCacheStore.cachedImage(for: urlString)
    }

    /// Synchronous warm : NSCache hit OR disk-to-NSCache decode + return.
    /// Used by `CachedAsyncImage.init` to peuple the image at cell mount time
    /// for cold-start conversations — avoids the thumbHash → image flash that
    /// otherwise occurs when NSCache has been evicted but the disk file is
    /// still present.
    nonisolated public static func warmedImage(for urlString: String) -> UIImage? {
        shared.images.warmedImage(for: urlString)
    }

    /// Check image disk cache synchronously. Returns local file URL if cached
    /// on disk (even when the decoded NSCache entry has been evicted). Used by
    /// the rendering pipeline to bypass the media policy gate for media that
    /// is already on device — a disk hit is a zero-network read.
    nonisolated public static func imageLocalFileURL(for urlString: String) -> URL? {
        shared.images.cachedFileURL(for: urlString)
    }

    /// Synchronous local file URL for a `thumbnails`-store key — e.g. a story
    /// cover composite rendered at publish (`StoryCoverThumbnail.cacheKey`). Lets
    /// a View (MainActor) read the cover without an actor hop. Mirrors
    /// `imageLocalFileURL` / `videoLocalFileURL`.
    nonisolated public static func thumbnailLocalFileURL(for key: String) -> URL? {
        shared.thumbnails.cachedFileURL(for: key)
    }

    /// Synchronous warm for the `thumbnails` store — NSCache hit OR
    /// disk-to-NSCache decode + return. Mirrors `warmedImage` (`images`
    /// store) for callers that need a `thumbnails`-store key resolved
    /// without an actor hop — e.g. a video poster persisted under
    /// `thumb:<url>`, read back synchronously at page mount so the first
    /// `body` renders it directly, no placeholder flash.
    nonisolated public static func warmedThumbnail(for key: String) -> UIImage? {
        shared.thumbnails.warmedImage(for: key)
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

    // Le trio translation garde l'idiome dict + order manuel (et non
    // `BoundedFIFOMap`) : son éviction doit retirer `translationTimestamps`
    // en lockstep ET la rehydratation disque (`loadTranslationCaches`)
    // réassigne l'ordre en bulk — deux besoins hors du contrat du helper.
    private var translationCache: [String: [TranslationData]] = [:]
    private var translationTimestamps: [String: Date] = [:]
    private var translationInsertionOrder: [String] = []
    /// Translations older than this are dropped at read time so stale
    /// machine output (model updates, content edits that the server
    /// hasn't reconciled yet, etc.) doesn't linger indefinitely in RAM.
    /// Matches the `messages` cache `staleTTL` window roughly.
    private static let translationMaxAge: TimeInterval = 24 * 3600
    private var transcriptionCache =
        BoundedFIFOMap<String, TranscriptionReadyEvent>(capacity: CacheCoordinator.maxTranslationCacheEntries)
    private var audioTranslationCache =
        BoundedFIFOMap<String, [AudioTranslationEvent]>(capacity: CacheCoordinator.maxTranslationCacheEntries)


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

    /// Éviction CIBLÉE des traductions d'UN message, RAM et table GRDB.
    ///
    /// Appelée quand le contenu du message a changé (édition) : ses traductions
    /// décrivent alors un texte qui n'existe plus. Sans la ligne disque, la
    /// purge en mémoire serait cosmétique — `loadTranslationCaches()` la
    /// réinjecterait au prochain démarrage. Jumelle par MESSAGE de
    /// `invalidateTranslationCaches()`, qui vide les trois caches de
    /// traduction/transcription en entier ; `clearTranslationCacheDB()` en est
    /// le pendant disque global. Les caches de transcription et d'audio
    /// traduit ne sont PAS touchés : éditer le texte d'un message ne périme
    /// pas la piste enregistrée.
    public func invalidateTranslations(for messageId: String) {
        translationCache.removeValue(forKey: messageId)
        translationTimestamps.removeValue(forKey: messageId)
        if let idx = translationInsertionOrder.firstIndex(of: messageId) {
            translationInsertionOrder.remove(at: idx)
        }
        deleteTranslationCacheRows(messageId: messageId)
    }

    private nonisolated func deleteTranslationCacheRows(messageId: String) {
        do {
            try db.write { db in
                _ = try TranslationCacheRecord
                    .filter(Column("messageId") == messageId)
                    .deleteAll(db)
            }
        } catch {
            logger.error("Failed to delete cached translations for \(messageId): \(error.localizedDescription)")
        }
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
        // R9 — chiffré comme les autres contenus sociaux (messages, profils,
        // notifications) : le tray porte du contenu privé (FRIENDS/ONLY).
        // Migration douce : les rows legacy en CLAIR échouent au déchiffrement
        // → cache-miss propre (contrat pinné par GRDBCacheStoreEncryptionTests)
        // → un refetch réseau unique au premier lancement, puis tout est chiffré.
        self.stories = GRDBCacheStore(policy: .stories, db: db, namespace: "stories", encrypted: true)
        self.stats = GRDBCacheStore(policy: .userStats, db: db, namespace: "stats")
        self.notifications = GRDBCacheStore(policy: .notifications, db: db, namespace: "notif", encrypted: true)
        self.affiliateTokens = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "affil")
        self.shareLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "slinks")
        self.trackingLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "tlinks")
        self.communityLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "clinks")
        self.communities = GRDBCacheStore(policy: .communities, db: db, namespace: "communities")
        self.drafts = GRDBCacheStore(policy: .drafts, db: db, namespace: "drafts")
        self.callTranscripts = GRDBCacheStore(policy: .callTranscripts, db: db, namespace: "calltx", encrypted: true)
        self.statuses = GRDBCacheStore(policy: .statuses, db: db, namespace: "statuses")
        self.friends = GRDBCacheStore(policy: .participants, db: db, namespace: "friends")
        self.friendRequests = GRDBCacheStore(policy: .participants, db: db, namespace: "freq", encrypted: true)
        self.blockedUsers = GRDBCacheStore(policy: .participants, db: db, namespace: "blocked", encrypted: true)
        self.userSearch = GRDBCacheStore(policy: .userProfiles, db: db, namespace: "usearch")
        self.phonebook = GRDBCacheStore(policy: .participants, db: db, namespace: "phonebook", encrypted: true)
        self.affiliates = GRDBCacheStore(policy: .participants, db: db, namespace: "affiliates")
        self.callHistory = GRDBCacheStore(policy: .callHistory, db: db, namespace: "callhist", encrypted: true)
        self.timeline = GRDBCacheStore(policy: .userStats, db: db, namespace: "timeline")
        self.categories = GRDBCacheStore(policy: .preferences, db: db, namespace: "prefs-cat")
        self.userTags = GRDBCacheStore(policy: .preferences, db: db, namespace: "prefs-tags")
        self.userPreferences = GRDBCacheStore(policy: .preferences, db: db, namespace: "prefs-user", encrypted: true)
        self.conversationPreferences = GRDBCacheStore(policy: .preferences, db: db, namespace: "prefs-conv", encrypted: true)

        self.images = DiskCacheStore(policy: .mediaImages)
        // Audio/vidéo : la lecture passe par des file URLs (AVPlayer), pas par
        // des Data résidents — 8 MB suffisent aux petits payloads (vocaux)
        // rejoués, et les 2 × 80 MB de plafonds théoriques disparaissent du
        // budget mémoire (cible app : < 150 MB).
        self.audio = DiskCacheStore(policy: .mediaAudio, memoryBudgetBytes: 8 * 1024 * 1024)
        self.video = DiskCacheStore(policy: .mediaVideo, memoryBudgetBytes: 8 * 1024 * 1024)
        self.thumbnails = DiskCacheStore(policy: .thumbnails)
    }

    public func start() {
        guard !isStarted else { return }
        isStarted = true
        resolveCurrentUserId()
        // Hors du chemin critique du boot : la réhydratation (read all rows +
        // GC + decode par row) bloquait `start()`, donc le
        // `conversations.load("list")` du splash qui le suit dans la même
        // task. Le corps est sans await : une fois planifié sur l'actor il
        // s'exécute d'un bloc, et un lecteur arrivé avant retombe sur les
        // traductions du payload REST puis la demande à la volée.
        translationHydrationTask = Task { self.hydrateTranslationCachesFromDisk() }
        subscribeToLifecycle()
        subscribeToPostEngagement()
        Task { await self.backfillSearchIndexIfNeeded() }
    }

    /// Réhydratation disque des caches de traduction lancée par `start()` —
    /// attendable par les tests (le GC du boot reste un contrat, seul son
    /// moment a changé).
    private(set) var translationHydrationTask: Task<Void, Never>?

    func awaitTranslationCacheHydration() async {
        await translationHydrationTask?.value
    }

    private func hydrateTranslationCachesFromDisk() {
        loadTranslationCaches()
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

        if let cachedConversations = await conversations.load(for: "list").snapshot(),
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
        await communities.invalidateAll()
        await drafts.invalidateAll()
        await callTranscripts.invalidateAll()
        await statuses.invalidateAll()
        await friends.invalidateAll()
        await friendRequests.invalidateAll()
        await blockedUsers.invalidateAll()
        await userSearch.invalidateAll()
        await callHistory.invalidateAll()
        await timeline.invalidateAll()
        // Preference stores are NOT userId-namespaced and the coordinator is a
        // process-lifetime singleton, so their in-memory L1 would otherwise
        // survive logout and expose user A's categories / tags / translation +
        // theme prefs / per-conversation pin-mute-archive to user B on the next
        // login. invalidateAll() also cancels their pending debounce task so a
        // dirty pref can't be re-flushed to L2 after this reset.
        await categories.invalidateAll()
        await userTags.invalidateAll()
        await userPreferences.invalidateAll()
        await conversationPreferences.invalidateAll()
        await images.invalidateAll()
        await audio.invalidateAll()
        await video.invalidateAll()
        await thumbnails.invalidateAll()
        await UserColorCache.shared.invalidateAll()
        // cache-07 — mapping username→displayName construit depuis les
        // conversations du compte sortant : RAM pure, aucun autre appelant de
        // clear() — sans cette ligne il survivait au logout ET au switch.
        UserDisplayNameCache.shared.clear()
        await SearchIndex.shared.clearAll()
        // No translation persist task to cancel — persistence is now incremental
        clearTranslationCacheDB()
        // Anti cross-user: drop any pending engagement sessions (open or
        // finalized) so user A's dwell/watch never flushes under user B.
        await EngagementOutbox.shared.purgeAll()
        // media-08 — fractions de lecture et checkpoints TUS ne sont pas
        // namespacés par userId : sans purge, le compte B hérite des
        // waveforms teintées et des sessions d'upload en cours du compte A.
        await TusUploadCheckpointStore.shared.purgeAll()
        await MainActor.run { MediaConsumptionStore.shared.purgeAll() }

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
        audioTranslationCache.removeAll()
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

    // MARK: - Post engagement write-through

    /// Un post est indexé sous PLUSIEURS clés du store `feed` (`main-feed`, la
    /// clé du pager de réels, `<postId>` pour l'écran de détail, `bookmarks`).
    /// Chaque ViewModel ne tenait à jour que sa propre collection en mémoire :
    /// le compteur de likes divergeait donc d'un écran à l'autre, et l'écran de
    /// détail — qui ne s'abonne pas aux likes — ne voyait jamais rien.
    ///
    /// `post:liked` / `post:unliked` portent un `likeCount` ABSOLU, calculé par
    /// le gateway depuis la table `PostReaction`. Le cache est donc la
    /// projection du serveur, jamais une somme de deltas locaux : deux surfaces
    /// ne peuvent plus dériver l'une de l'autre.
    private func subscribeToPostEngagement() {
        socialSocket.postLiked
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.applyPostLike(
                        postId: data.postId, likeCount: data.likeCount,
                        actorId: data.userId, liked: true
                    )
                }
            }
            .store(in: &cancellables)

        socialSocket.postUnliked
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.applyPostLike(
                        postId: data.postId, likeCount: data.likeCount,
                        actorId: data.userId, liked: false
                    )
                }
            }
            .store(in: &cancellables)

        socialSocket.commentAdded
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.feed.patchEverywhere(itemId: data.postId) {
                        $0.commentCount = data.commentCount
                    }
                }
            }
            .store(in: &cancellables)

        socialSocket.commentDeleted
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.feed.patchEverywhere(itemId: data.postId) {
                        $0.commentCount = data.commentCount
                    }
                }
            }
            .store(in: &cancellables)

        // `post:bookmarked` n'est émis QUE vers le bookmarker (événement
        // personnel côté gateway) : pas de filtre d'acteur nécessaire.
        socialSocket.postBookmarked
            .sink { [weak self] data in
                guard let self else { return }
                Task {
                    await self.feed.patchEverywhere(itemId: data.postId) {
                        $0.isBookmarkedByMe = data.bookmarked
                        if let count = data.bookmarkCount { $0.bookmarkCount = count }
                    }
                }
            }
            .store(in: &cancellables)

        socialSocket.postDeleted
            .sink { [weak self] postId in
                guard let self else { return }
                Task { await self.feed.removeEverywhere(itemId: postId) }
            }
            .store(in: &cancellables)
    }

    /// `isLiked` n'est réécrit que si l'acteur EST l'utilisateur courant : le
    /// like d'un tiers monte le compteur sans allumer le cœur.
    private func applyPostLike(postId: String, likeCount: Int, actorId: String, liked: Bool) async {
        let isCurrentUser = !currentUserId.isEmpty && actorId == currentUserId
        await feed.patchEverywhere(itemId: postId) { post in
            post.likes = likeCount
            if isCurrentUser { post.isLiked = liked }
        }
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
        transcriptionCache[event.messageId] = event
    }

    public func cacheAudioTranslation(_ event: AudioTranslationEvent) {
        let msgId = event.messageId
        var existing = audioTranslationCache[msgId] ?? []
        if let idx = existing.firstIndex(where: { $0.translatedAudio.targetLanguage == event.translatedAudio.targetLanguage }) {
            existing[idx] = event
        } else {
            existing.append(event)
        }
        audioTranslationCache[msgId] = existing
    }

    private func evictTranslationCacheIfNeeded() {
        while translationCache.count > Self.maxTranslationCacheEntries, let oldest = translationInsertionOrder.first {
            translationInsertionOrder.removeFirst()
            translationCache.removeValue(forKey: oldest)
            translationTimestamps.removeValue(forKey: oldest)
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
            // Task 1.3 — terminate flush: instead of a `DispatchSemaphore.wait`
            // that could expire mid-write (semaphore times out before
            // `flushAll()` reaches disk, dirty keys are lost), submit a
            // `BGProcessingTask` so the OS can complete the work after the
            // process is suspended, and fire a best-effort foreground flush
            // with a 4s deadline in parallel. Whichever path wins the race
            // persists the dirty set; the other becomes a no-op because
            // `flushDirtyKeys` is idempotent.
            #if canImport(BackgroundTasks)
            let request = BGProcessingTaskRequest(identifier: CacheBackgroundFlushTask.identifier)
            request.requiresNetworkConnectivity = false
            request.requiresExternalPower = false
            do {
                try BGTaskScheduler.shared.submit(request)
            } catch {
                Logger.cache.warning("Failed to submit background flush task: \(error.localizedDescription, privacy: .public)")
            }
            #endif
            guard let self else { return }
            Task { await self.flushAll(deadline: Date().addingTimeInterval(4)) }
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

    /// cache-01 — LA liste des stores GRDB, en criticité décroissante (les
    /// premiers flushés si la deadline coupe). Toute divergence avec les
    /// propriétés déclarées en tête de classe est un bug : les énumérations
    /// explicites de reset()/invalidateAll() restent séparées à dessein.
    private var allGRDBStores: [any GRDBDirtyFlushing] {
        [
            conversations, messages, notifications, feed, stories, participants, profiles,
            comments, statuses, communities, stats, drafts, callTranscripts, friends,
            friendRequests, blockedUsers, userSearch, callHistory, timeline,
            affiliateTokens, shareLinks, trackingLinks, communityLinks,
            categories, userTags, userPreferences, conversationPreferences
        ]
    }

    public func flushAll() async {
        await flushAll(deadline: nil)
    }

    /// Deadline-aware flush invoked by `CacheBackgroundFlushTask` and the
    /// `willTerminate` lifecycle hook (Task 1.3 of the iOS Local-First
    /// Wave 1 plan). Each store is asked to drain its dirty set, checking
    /// the deadline between keys so a long-running flush can abandon
    /// cleanly when the OS budget is about to run out. Stores not yet
    /// drained stay dirty — the next foreground hop or scheduled BG task
    /// picks them up. A `nil` deadline preserves the legacy unbounded
    /// behaviour used by `evictUnderMemoryPressure` and the foreground
    /// `BackgroundTransitionCoordinator` hook.
    ///
    /// Note: the GRDB writes are sequenced (one transaction per dirty key
    /// per store) rather than batched into a single global transaction.
    /// Option A in the plan — see the task notes for the trade-off.
    public func flushAll(deadline: Date?) async {
        // cache-01 — itère TOUS les stores (l'ancienne énumération n'en
        // couvrait que 6 : l'état « lu » des notifications se perdait au
        // kill). La persistance des traductions est incrémentale (cache-02).
        for store in allGRDBStores {
            if let deadline, Date() >= deadline { return }
            await store.flushDirtyKeys(deadline: deadline)
        }
    }

    public func evictUnderMemoryPressure() async {
        for store in allGRDBStores {
            await store.flushDirtyKeys()
        }
        for store in allGRDBStores {
            await store.evictL1()
        }

        await images.evictExpired()
        await audio.evictExpired()
        await video.evictExpired()
        await thumbnails.evictExpired()

        // cache-06 — le trio de traduction TEXTE est plafonné à 500 entrées
        // (quelques centaines de Ko) : le vider ici ne libère presque rien
        // face aux NSCache médias évincés ci-dessus, et force un aller ZMQ +
        // une passe NLLB par message au rendu suivant (bulles retombées sur
        // l'original — violation du Prisme). On le laisse chaud ; l'éviction
        // FIFO (evictTranslationCacheIfNeeded) reste le garde-fou de taille.
        transcriptionCache.removeAll()
        audioTranslationCache.removeAll()

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
            // cache-02 — GC des rows au-delà du cutoff : le full-rewrite
            // supprimé assurait accessoirement cette purge ; sans elle la
            // table croît sans borne. Write séparé et loggé : un échec de GC
            // ne doit pas empêcher le chargement.
            do {
                try db.write { db in
                    _ = try TranslationCacheRecord
                        .filter(Column("cachedAt") <= cutoff)
                        .deleteAll(db)
                }
            } catch {
                logger.error("Failed to GC stale translation cache rows: \(error.localizedDescription, privacy: .public)")
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
        await communities.invalidateAll()
        await drafts.invalidateAll()
        await categories.invalidateAll()
        await userTags.invalidateAll()
        await userPreferences.invalidateAll()
        await conversationPreferences.invalidateAll()
        // Ces douze stores n'étaient PAS énumérés ici. Ils disparaissaient
        // quand même, par effet de bord : `GRDBCacheStore.deleteAllL2()` vidait
        // les tables `cache_entries` / `cache_metadata` en entier, donc le
        // premier `invalidateAll()` de la liste emportait déjà tout le reste.
        // Ce comportement global ayant été corrigé (chaque store ne purge plus
        // que son propre namespace), il faut désormais les nommer pour que
        // `invalidateAll()` continue de tout vider comme avant.
        await comments.invalidateAll()
        await stats.invalidateAll()
        await notifications.invalidateAll()
        await affiliateTokens.invalidateAll()
        await shareLinks.invalidateAll()
        await trackingLinks.invalidateAll()
        await communityLinks.invalidateAll()
        await callTranscripts.invalidateAll()
        await statuses.invalidateAll()
        await friends.invalidateAll()
        await callHistory.invalidateAll()
        await timeline.invalidateAll()
        await images.invalidateAll()
        await audio.invalidateAll()
        await video.invalidateAll()
        await thumbnails.invalidateAll()
        await UserColorCache.shared.invalidateAll()
        translationCache.removeAll()
        translationInsertionOrder.removeAll()
        translationTimestamps.removeAll()
        transcriptionCache.removeAll()
        audioTranslationCache.removeAll()
        clearTranslationCacheDB()
    }

    private nonisolated func clearTranslationCacheDB() {
        do {
            try db.write { db in _ = try TranslationCacheRecord.deleteAll(db) }
        } catch {
            logger.error("Failed to clear translation cache table: \(error.localizedDescription)")
        }
    }

    /// Purge ciblée des 3 caches in-memory de traduction/transcription +
    /// la table GRDB `TranslationCacheRecord`. Exposé publiquement pour
    /// que le pull-to-refresh (ou tout autre flow voulant re-traduire)
    /// puisse forcer un re-fetch des traductions sans toucher aux
    /// stores principaux (conversations, messages, etc.).
    ///
    /// Cas d'usage : l'utilisateur tire-pour-rafraîchir et veut
    /// récupérer les éventuelles re-traductions côté serveur (modèle
    /// NLLB mis à jour, contenu édité, langue préférée changée).
    public func invalidateTranslationCaches() {
        translationCache.removeAll()
        translationInsertionOrder.removeAll()
        translationTimestamps.removeAll()
        transcriptionCache.removeAll()
        audioTranslationCache.removeAll()
        clearTranslationCacheDB()
    }

    // MARK: - Test Helpers (Task 1.3)
    //
    // The background flush test harness exercises the deadline-aware
    // `flushAll(deadline:)` path against a coordinator instance bound to
    // an in-memory database. These helpers seed and inspect the
    // `conversations` store dirty set without going through the public
    // `save()` path — which would flush synchronously via the L2 writer
    // and leave the dirty set empty by the time the test pokes at it.
    //
    // Marked `public` so tests in a separate module can call them; the
    // body is trivially side-effect-free for production callers (the
    // returned count is just an introspection).

    /// Synthesise `count` dirty conversation entries directly in the L1
    /// cache + dirty set, bypassing `save()` so the L2 writer doesn't
    /// drain the dirty bookkeeping before the flush path under test
    /// runs. Used by `CacheBackgroundFlushTests`.
    public func markDirtyForTest(count: Int) async throws {
        let entries: [(String, [MeeshyConversation])] = (0..<count).map { idx in
            let key = "test-key-\(idx)"
            let conv = MeeshyConversation(
                id: "conv-test-\(idx)",
                identifier: "test-\(idx)",
                type: .direct,
                title: "Test \(idx)",
                lastMessageAt: Date(),
                unreadCount: 0
            )
            return (key, [conv])
        }
        await conversations.seedDirtyForTest(items: entries)
    }

    /// Total dirty key count across all GRDB-backed stores driven by the
    /// deadline-aware flush. Mirrors the surfaces touched by
    /// `flushAll(deadline:)` so a test can assert "no work left to do".
    public func dirtyCountForTest() async -> Int {
        var total = 0
        for store in allGRDBStores {
            total += await store.dirtyKeyCount()
        }
        return total
    }
}

// MARK: - Test Seam — ProfileCacheWriting

/// Narrow contract for persisting an updated user in the profile cache.
/// EditProfileViewModel uses this after `AuthManager.applyLocalProfileChanges`
/// so the optimistic state survives an app kill via GRDBCacheStore.
public protocol ProfileCacheWriting: Sendable {
    func saveProfile(_ user: MeeshyUser, for userId: String) async throws
}

extension CacheCoordinator: ProfileCacheWriting {
    public func saveProfile(_ user: MeeshyUser, for userId: String) async throws {
        try await profiles.save([user], for: userId)
    }
}
