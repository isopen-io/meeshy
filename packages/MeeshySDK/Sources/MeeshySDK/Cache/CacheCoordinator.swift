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
    /// #8095 — l'INDEX des messages porteurs d'image ou de vidéo, clé =
    /// conversationId, feuilleté depuis `?view=media`. Distinct de `messages` :
    /// celui-ci est une fenêtre plafonnée que la chronologie réécrit, l'index
    /// tient la conversation entière pour la galerie. Chiffré comme `messages`.
    public let conversationMedia: GRDBCacheStore<String, MeeshyMessage>
    public let participants: GRDBCacheStore<String, PaginatedParticipant>
    public let profiles: GRDBCacheStore<String, MeeshyUser>
    public let feed: GRDBCacheStore<String, FeedPost>
    public let comments: GRDBCacheStore<String, FeedComment>
    public let stories: GRDBCacheStore<String, StoryGroup>
    public let stats: GRDBCacheStore<String, UserStats>
    /// #10093 — les statistiques PUBLIQUES d'un profil visité, clé = userId. Distinct de `stats` (les miennes,
    /// dix entrées au plus) : visiter onze fiches n'évince pas mes chiffres, et la fiche d'un autre se rouvre peinte.
    public let profileStats: GRDBCacheStore<String, UserStats>
    /// #10111 — la fiche d'un participant de conversation, clé = `conversationId/participantId`. Chiffrée : elle
    /// peut porter l'e-mail et la date de naissance servis au cercle des hôtes.
    public let participantProfiles: GRDBCacheStore<String, ConversationParticipantProfile>
    /// L'instantané de `GET /me/engagement` (#5698) — badges, série, niveau
    /// de l'utilisateur courant, UNE entrée par compte (`id = "current"`).
    /// Même politique que `stats` : l'écran « Progression » s'ouvre sur le
    /// dernier instantané connu et revalide en silence.
    public let engagementProgress: GRDBCacheStore<String, APIEngagementProgress>
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
    /// #8698 — per-call network and quality journal, local to this device.
    public let callNetworkJournals: GRDBCacheStore<String, CallNetworkJournal>
    public let statuses: GRDBCacheStore<String, StatusEntry>
    public let friends: GRDBCacheStore<String, FriendRequestUser>
    public let friendRequests: GRDBCacheStore<String, FriendRequest>
    public let blockedUsers: GRDBCacheStore<String, BlockedUser>
    /// #9612 — Sécurité > Sessions s'ouvre sur la dernière liste connue. Chiffré : adresses et villes.
    /// `nonisolated` : un acteur ne protège rien d'une constante Sendable, et la
    /// lecture reste synchrone hors du module sous Swift 6.2 comme sous 6.4.
    nonisolated public let sessions: GRDBCacheStore<String, UserSession>
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

    // MARK: - In-Memory Translation/Transcription/Audio Caches (keyed by messageId)

    static let maxTranslationCacheEntries = 500

    // Le trio translation garde l'idiome dict + order manuel (et non
    // `BoundedFIFOMap`) : son éviction doit retirer `translationTimestamps`
    // en lockstep ET la rehydratation disque (`loadTranslationCaches`)
    // réassigne l'ordre en bulk — deux besoins hors du contrat du helper.
    var translationCache: [String: [TranslationData]] = [:]
    var translationTimestamps: [String: Date] = [:]
    var translationInsertionOrder: [String] = []
    /// Translations older than this are dropped at read time so stale
    /// machine output (model updates, content edits that the server
    /// hasn't reconciled yet, etc.) doesn't linger indefinitely in RAM.
    /// Matches the `messages` cache `staleTTL` window roughly.
    static let translationMaxAge: TimeInterval = 24 * 3600
    var transcriptionCache =
        BoundedFIFOMap<String, TranscriptionReadyEvent>(capacity: CacheCoordinator.maxTranslationCacheEntries)
    var audioTranslationCache =
        BoundedFIFOMap<String, [AudioTranslationEvent]>(capacity: CacheCoordinator.maxTranslationCacheEntries)



    let messageSocket: any MessageSocketProviding
    let socialSocket: any SocialSocketProviding
    nonisolated let db: any DatabaseWriter
    var cancellables = Set<AnyCancellable>()
    var lifecycleObservers: [NSObjectProtocol] = []
    let logger = MeeshyLog.logger(.cacheCoordinator, subsystem: .legacySDK)
    private var isStarted = false
    var currentUserId: String = ""

    /// #8674 — où dorment les caches des comptes quittés mais gardés, et qui
    /// possède le cache vivant. Injectables pour les témoins.
    nonisolated let accountArchiveDirectory: URL
    nonisolated(unsafe) let ownerDefaults: UserDefaults

    public init(
        messageSocket: any MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: any SocialSocketProviding = SocialSocketManager.shared,
        db: any DatabaseWriter = AppDatabase.shared.databaseWriter,
        accountArchiveDirectory: URL = AppDatabase.accountArchiveDirectory,
        ownerDefaultsSuite: String? = nil
    ) {
        self.messageSocket = messageSocket
        self.socialSocket = socialSocket
        self.db = db
        self.accountArchiveDirectory = accountArchiveDirectory
        self.ownerDefaults = ownerDefaultsSuite.flatMap(UserDefaults.init(suiteName:)) ?? .standard

        self.conversations = GRDBCacheStore(policy: .conversations, db: db, namespace: "conv", encrypted: true)
        self.messages = GRDBCacheStore(policy: .messages, db: db, namespace: "msg", encrypted: true)
        self.conversationMedia = GRDBCacheStore(policy: .conversationMedia, db: db, namespace: "convmedia", encrypted: true)
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
        self.profileStats = GRDBCacheStore(policy: .userProfiles, db: db, namespace: "pstats")
        self.participantProfiles = GRDBCacheStore(policy: .userProfiles, db: db, namespace: "partprof", encrypted: true)
        self.engagementProgress = GRDBCacheStore(policy: .userStats, db: db, namespace: "engagement")
        self.notifications = GRDBCacheStore(policy: .notifications, db: db, namespace: "notif", encrypted: true)
        self.affiliateTokens = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "affil")
        self.shareLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "slinks")
        self.trackingLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "tlinks")
        self.communityLinks = GRDBCacheStore(policy: .linksAndTokens, db: db, namespace: "clinks")
        self.communities = GRDBCacheStore(policy: .communities, db: db, namespace: "communities")
        self.drafts = GRDBCacheStore(policy: .drafts, db: db, namespace: "drafts")
        self.callTranscripts = GRDBCacheStore(policy: .callTranscripts, db: db, namespace: "calltx", encrypted: true)
        self.callNetworkJournals = GRDBCacheStore(policy: .callNetworkJournals, db: db, namespace: "callnet", encrypted: true)
        self.statuses = GRDBCacheStore(policy: .statuses, db: db, namespace: "statuses")
        self.friends = GRDBCacheStore(policy: .participants, db: db, namespace: "friends")
        self.friendRequests = GRDBCacheStore(policy: .participants, db: db, namespace: "freq", encrypted: true)
        self.blockedUsers = GRDBCacheStore(policy: .participants, db: db, namespace: "blocked", encrypted: true)
        self.sessions = GRDBCacheStore(policy: .participants, db: db, namespace: "sessions", encrypted: true)
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
        // budget mémoire (cible app : < 150 MB). Funnel en flux vers un fichier (#9863).
        self.audio = DiskCacheStore(policy: .mediaAudio, memoryBudgetBytes: 8 * 1024 * 1024, networkTransfer: .streamedToFile)
        self.video = DiskCacheStore(policy: .mediaVideo, memoryBudgetBytes: 8 * 1024 * 1024, networkTransfer: .streamedToFile, readsWhileDownloading: true)
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

    func hydrateTranslationCachesFromDisk() {
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
        await wipeLiveContent()
        stop()
        markLiveOwner(.nobody)
    }

    /// #8674 — vide le cache VIVANT (disque et mémoire) sans toucher aux
    /// caches mis de côté des autres comptes. C'est la moitié « purge » de
    /// `reset()` ; `bindAccount(_:isPreserved:)` l'appelle à chaque changement
    /// de propriétaire.
    func wipeLiveContent() async {
        // 1. Purge everything on disk first so a concurrent reader on the
        //    other side of the actor hop sees an empty cache (no stale
        //    entries from the previous user).
        // cache-09 (#7146) — TOUS les stores GRDB, sans exception nommable.
        // Cette boucle a remplacé vingt-huit appels recopiés à la main, dont
        // l'inventaire avait divergé des propriétés déclarées : `phonebook`
        // (le carnet d'adresses complet de l'appareil) et `affiliates` n'y
        // figuraient pas, et survivaient donc à la déconnexion depuis que
        // `deleteAllL2()` ne purge plus que son propre namespace. Aucun store
        // ne s'ajoute plus ici — il s'ajoute à `allGRDBStores`, que
        // `CacheCoordinatorPurgeInventoryTests` confronte aux déclarations.
        //
        // Les stores de préférences en font partie et ce n'est pas un détail :
        // ils ne sont pas cantonnés par identifiant de compte et le
        // coordinateur vit le temps du processus, donc leur L1 exposerait les
        // catégories, étiquettes, préférences de traduction et de thème, et les
        // réglages épinglé/muet/archivé du compte A au compte B. Leur
        // `invalidateAll()` annule aussi le report d'écriture en attente, sans
        // quoi une préférence modifiée pourrait être réécrite en L2 APRÈS ce
        // reset.
        for store in allGRDBStores {
            await store.invalidateAll()
        }
        await images.invalidateAll()
        await audio.invalidateAll()
        await video.invalidateAll()
        await thumbnails.invalidateAll()
        await UserColorCache.shared.invalidateAll()
        // cache-07 — mapping username→displayName construit depuis les
        // conversations du compte sortant : RAM pure, aucun autre appelant de
        // clear() — sans cette ligne il survivait au logout ET au switch.
        UserDisplayNameCache.shared.clear()
        // #8120 — cartes de conversation et verdicts 403/404 : RAM pure d'un
        // singleton du processus, sans quoi le compte B verrait la carte
        // « membre » résolue pour le compte A.
        ConversationCardService.shared.invalidateAll()
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

        translationCache.removeAll()
        translationInsertionOrder.removeAll()
        translationTimestamps.removeAll()
        transcriptionCache.removeAll()
        audioTranslationCache.removeAll()
    }

    /// Démonte les abonnements pour que le `start()` suivant réarme, SANS
    /// rien effacer : à la sortie de session, ce qui doit partir est décidé
    /// par `bindAccount(_:isPreserved:)` — le cache d'un compte gardé est mis
    /// de côté, celui d'un compte déconnecté est effacé (#8674).
    public func stop() {
        isStarted = false
        cancellables.removeAll()
        for observer in lifecycleObservers {
            NotificationCenter.default.removeObserver(observer)
        }
        lifecycleObservers.removeAll()
        currentUserId = ""
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


    public func invalidateAll() async {
        // cache-09 (#7146) — même inventaire que `reset()`, même raison.
        //
        // L'histoire de cette liste dit pourquoi elle ne peut plus être tenue à
        // la main : `GRDBCacheStore.deleteAllL2()` vidait autrefois les tables
        // `cache_entries` / `cache_metadata` EN ENTIER, si bien que le premier
        // `invalidateAll()` énuméré emportait déjà tous les autres — un store
        // absent de la liste disparaissait quand même. Ce comportement global
        // a été cantonné au namespace du store, et il a fallu nommer douze
        // stores de plus pour que la purge reste complète. Deux ont été
        // manqués à ce moment-là. Une boucle sur `allGRDBStores` supprime la
        // possibilité même de l'oubli.
        for store in allGRDBStores {
            await store.invalidateAll()
        }
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
