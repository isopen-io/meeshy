import Foundation
import SwiftUI
import Combine
import MeeshySDK

@MainActor
class StatusViewModel: ObservableObject {
    @Published var statuses: [StatusEntry] = [] {
        didSet { statusIndexByUserId = Self.index(statuses) }
    }
    /// Index `userId → position` reconstruit à chaque écriture de `statuses`
    /// (O(n), rare) pour que `statusForUser` soit O(1) — il était un balayage
    /// linéaire appelé par cellule de message et par rangée de conversation
    /// (audit fluidité 2026-08-21).
    private var statusIndexByUserId: [String: Int] = [:]

    private static func index(_ entries: [StatusEntry]) -> [String: Int] {
        var index: [String: Int] = [:]
        index.reserveCapacity(entries.count)
        for (offset, entry) in entries.enumerated() where index[entry.userId] == nil {
            index[entry.userId] = offset
        }
        return index
    }
    @Published var myStatus: StatusEntry?
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var error: String?

    let mode: StatusService.Mode
    private let statusService: StatusServiceProviding
    private var cancellables = Set<AnyCancellable>()
    private let socialSocket: SocialSocketProviding
    private let authManager: AuthManaging
    private let offlineQueue: OfflineQueueing
    private let postService: PostServiceProviding
    private let isOffline: () -> Bool

    /// Groupement, persistance et flush (arrière-plan / relance) portés par
    /// `ImpressionBatcher`.
    private lazy var impressions = ImpressionBatcher(source: "status", postService: postService)

    /// A mood is "stuck offline" (recoverable as a draft) once it has been
    /// unsent for longer than this — the "pas envoyé dans la minute → offline"
    /// rule shared by every composer. `nonisolated` so it can be read from any
    /// isolation (matches `SyncPillViewModel.staleInflightThreshold`).
    nonisolated static let offlineStuckThreshold: TimeInterval = 60

    // Cursor pagination
    private var nextCursor: String?
    private var hasMore = true

    static let moodOptions: [String] = [
        "😴", "🎉", "💪", "☕", "🔥",
        "💭", "🎵", "📚", "✈️", "❤️"
    ]

    init(
        mode: StatusService.Mode = .friends,
        statusService: StatusServiceProviding = StatusService.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        authManager: AuthManaging = AuthManager.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        postService: PostServiceProviding = PostService.shared,
        isOffline: @escaping () -> Bool = { NetworkMonitor.shared.isOffline }
    ) {
        self.mode = mode
        self.statusService = statusService
        self.socialSocket = socialSocket
        self.authManager = authManager
        self.offlineQueue = offlineQueue
        self.postService = postService
        self.isOffline = isOffline
    }

    // MARK: - Portée (impressions & vues)
    //
    // Un mood EST un post (`PostType.STATUS`) : il porte `impressionCount` et
    // `viewCount` comme les autres. Aucune surface ne les alimentait — la barre
    // de moods était le seul contenu du produit dont la portée restait à zéro.
    //
    // Même contrat que le feed : une impression par APPARITION du pill, groupée
    // sur 3 s ; la vue UNIQUE part à l'ouverture du popover (dédupliquée côté
    // serveur par `PostView`, donc rejouable sans risque).

    /// Le mood `statusId` est apparu à l'écran.
    func trackImpression(_ statusId: String) {
        impressions.record(statusId)
    }

    /// À appeler quand la barre disparaît : sans ce flush, le lot en cours de
    /// groupement est perdu.
    func flushImpressions() async {
        await impressions.flushNow()
    }

    /// Le mood `statusId` a été ouvert (popover) — vue unique par utilisateur.
    func markStatusViewed(_ statusId: String) {
        Task { [postService] in try? await postService.viewPost(postId: statusId, duration: nil) }
    }

    // MARK: - Load Statuses

    func loadStatuses() async {
        guard !isLoading else { return }
        error = nil

        let cacheKey = "statuses_\(mode)"
        let cached = await CacheCoordinator.shared.statuses.load(for: cacheKey)

        switch cached {
        case .fresh(let data, _):
            statuses = data
            if mode == .friends { myStatus = statuses.first }
            return

        case .stale(let data, _):
            statuses = data
            if mode == .friends { myStatus = statuses.first }
            Task { [weak self] in
                await self?.fetchStatusesFromNetwork(cacheKey: cacheKey)
            }
            return

        case .expired, .empty:
            isLoading = statuses.isEmpty
        }

        await fetchStatusesFromNetwork(cacheKey: cacheKey)
        isLoading = false
    }

    private func fetchStatusesFromNetwork(cacheKey: String) async {
        nextCursor = nil
        hasMore = true

        do {
            let response = try await statusService.list(mode: mode, cursor: nil, limit: 20)

            if response.success {
                let entries = response.data.compactMap { $0.toStatusEntry() }
                statuses = entries
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
                if mode == .friends { myStatus = statuses.first }
                try? await CacheCoordinator.shared.statuses.save(entries, for: cacheKey)
            } else {
                if statuses.isEmpty {
                    error = String(localized: "Impossible de charger les statuts", defaultValue: "Impossible de charger les statuts")
                }
            }
        } catch {
            if statuses.isEmpty {
                self.error = error.localizedDescription
            }
        }
    }

    // MARK: - Load More (infinite scroll)

    func loadMoreIfNeeded(currentStatus: StatusEntry) async {
        guard hasMore, !isLoadingMore, !isLoading else { return }

        // Trigger when within last 3 items
        let thresholdIndex = max(0, statuses.count - 3)
        guard let currentIndex = statuses.firstIndex(where: { $0.id == currentStatus.id }),
              currentIndex >= thresholdIndex else { return }

        isLoadingMore = true

        do {
            let response = try await statusService.list(mode: mode, cursor: nextCursor, limit: 20)

            if response.success {
                let newStatuses = response.data.compactMap { $0.toStatusEntry() }
                let existingIds = Set(statuses.map(\.id))
                let deduplicated = newStatuses.filter { !existingIds.contains($0.id) }
                statuses.append(contentsOf: deduplicated)
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
            }
        } catch {
            // Silent failure
        }

        isLoadingMore = false
    }

    // MARK: - Refresh

    func refresh() async {
        let cacheKey = "statuses_\(mode)"
        await CacheCoordinator.shared.statuses.invalidate(for: cacheKey)
        nextCursor = nil
        hasMore = true
        await loadStatuses()
    }

    // MARK: - Set Status

    /// - Parameter mentions: les personnes que ce mood nomme sans que son texte
    ///   le dise. `nil` quand il n'y en a aucune — `[]` serait entendu comme un
    ///   effacement.
    /// - Parameter repostOfId: la publication republiée. **Seul porteur de
    ///   l'attribution** : il n'y a pas de `viaUsername` sur le fil, le gateway
    ///   ne l'a jamais lu. Le bandeau « Status de @X » du composer reste, mais
    ///   c'est un fait local d'affichage, pas une écriture.
    func setStatus(emoji: String, content: String?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, audioUrl: String? = nil, repostOfId: String? = nil, mentions: [PostMentionInput]? = nil) async {
        // Offline: persist the mood durably through the SAME `.createPost` outbox
        // row as posts/reels (type STATUS) so it is not lost, and survives an app
        // kill. We do NOT insert an optimistic entry — unlike posts, the gateway
        // does not echo the clientMutationId on `status:created`, so the mood is
        // reconciled when it actually lands (via the socket) on reconnect. The
        // composer can recover this stuck row as a draft (recoverUnsentStatus).
        if isOffline() {
            let payload = CreatePostPayload(
                clientMutationId: ClientMutationId.generate(),
                content: content ?? "",
                attachmentIds: [],
                visibility: visibility,
                originalLanguage: DefaultComposerLanguage.resolve(),
                type: "STATUS",
                moodEmoji: emoji,
                visibilityUserIds: visibilityUserIds,
                mentions: (mentions?.isEmpty ?? true) ? nil : mentions
            )
            do {
                try await offlineQueue.enqueue(.createPost, payload: payload, conversationId: nil)
                FeedbackToastManager.shared.showSuccess(String(localized: "status.queuedOffline", defaultValue: "Mood en attente d'envoi", bundle: .main))
            } catch {
                FeedbackToastManager.shared.showError(String(localized: "status.publishError", defaultValue: "Error publishing status", bundle: .main))
            }
            return
        }

        do {
            let post = try await statusService.create(moodEmoji: emoji, content: content, originalLanguage: DefaultComposerLanguage.resolve(), visibility: visibility, visibilityUserIds: visibilityUserIds, audioUrl: audioUrl, repostOfId: repostOfId, mentions: mentions)

            if let entry = post.toStatusEntry() {
                myStatus = entry
                statuses.insert(entry, at: 0)
                await saveCacheSnapshot()
            }
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "status.publishError", defaultValue: "Error publishing status", bundle: .main))
        }
    }

    // MARK: - Offline Draft Recovery

    /// Returns the last mood that got stuck offline (unsent for more than
    /// `offlineStuckThreshold`) so the composer can pre-fill it as a draft.
    func recoverUnsentStatus() async -> RecoveredOfflinePost? {
        await offlineQueue.recoverLastUnsentPost(
            matchingTypes: ["STATUS"],
            olderThan: Self.offlineStuckThreshold
        )
    }

    /// Supersedes a recovered mood when the user re-sends it from the composer,
    /// so the resend replaces the stuck row instead of duplicating it.
    func supersedeRecoveredStatus(clientMutationId: String) async {
        await offlineQueue.cancelCreatePost(clientMutationId: clientMutationId)
    }

    // MARK: - Clear Status

    func clearStatus() async {
        guard let status = myStatus else { return }

        let snapshot = statuses
        let previousStatus = myStatus
        statuses.removeAll { $0.id == status.id }
        myStatus = nil

        do {
            try await statusService.delete(statusId: status.id)
            await saveCacheSnapshot()
        } catch {
            statuses = snapshot
            myStatus = previousStatus
            FeedbackToastManager.shared.showError(String(localized: "status.deleteError", defaultValue: "Error deleting status", bundle: .main))
        }
    }

    private func saveCacheSnapshot() async {
        let cacheKey = "statuses_\(mode)"
        try? await CacheCoordinator.shared.statuses.save(statuses, for: cacheKey)
    }

    // MARK: - Current User Info (for preview)

    var currentUserDisplayName: String {
        let user = authManager.currentUser
        return user?.displayName ?? user?.username ?? "Moi"
    }

    var currentUserInitial: String {
        let user = authManager.currentUser
        return user?.firstName?.prefix(1).uppercased()
            ?? user?.username.prefix(1).uppercased()
            ?? "M"
    }

    // MARK: - Lookup Methods

    func statusForUser(userId: String) -> StatusEntry? {
        guard let offset = statusIndexByUserId[userId], offset < statuses.count else { return nil }
        return statuses[offset]
    }

    // MARK: - Mood Tap Handler

    /// - Parameter repliesInline: vrai quand le mood est affiché dans la barre de
    ///   la conversation directe de son auteur — toucher son contenu répond alors
    ///   immédiatement (sans pop-up de confirmation).
    func moodTapHandler(for userId: String, repliesInline: Bool = false) -> ((CGPoint) -> Void)? {
        guard statusForUser(userId: userId) != nil else { return nil }
        return { [weak self] point in
            guard let entry = self?.statusForUser(userId: userId) else { return }
            Task { @MainActor in
                StatusBubbleController.shared.show(entry: entry, anchor: point, repliesInline: repliesInline)
            }
        }
    }

    // MARK: - Socket.IO Real-Time Updates

    /// Applique un delta de reaction sur un resume par emoji. Un compte qui
    /// retombe a zero perd sa cle : le laisser a 0 afficherait une pastille
    /// vide, et le resume ne descend jamais sous zero meme si un
    /// `status:unreacted` arrive sans son `status:reacted` (reconnexion).
    static func applyingReaction(
        emoji: String, delta: Int, to summary: [String: Int]?
    ) -> [String: Int] {
        var updated = summary ?? [:]
        let next = (updated[emoji] ?? 0) + delta
        if next > 0 {
            updated[emoji] = next
        } else {
            updated.removeValue(forKey: emoji)
        }
        return updated
    }

    func subscribeToSocketEvents() {
        guard cancellables.isEmpty else { return }

        socialSocket.statusCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                if let entry = apiPost.toStatusEntry() {
                    if !self.statuses.contains(where: { $0.id == entry.id }) {
                        self.statuses.insert(entry, at: 0)
                        self.persistSnapshot()
                    }
                }
            }
            .store(in: &cancellables)

        socialSocket.statusDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] statusId in
                guard let self, self.statuses.contains(where: { $0.id == statusId }) else { return }
                self.statuses.removeAll { $0.id == statusId }
                self.persistSnapshot()
            }
            .store(in: &cancellables)

        socialSocket.statusUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                if let entry = apiPost.toStatusEntry(),
                   let index = self.statuses.firstIndex(where: { $0.id == entry.id }) {
                    self.statuses[index] = entry
                    self.persistSnapshot()
                }
            }
            .store(in: &cancellables)

        // Reception temps reel des reactions de statut (le REST /posts/:id/like
        // emet `status:reacted` cote gateway). La propre reaction de l'utilisateur
        // est deja posee optimistiquement par reactToStatus ; on n'applique donc
        // que celles des AUTRES. Le payload ne porte pas de compte agrege, on
        // incremente prudemment (meme garde d'echo que la reaction de conversation).
        socialSocket.statusReacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.applyReactionDelta(statusId: payload.statusId, emoji: payload.emoji,
                                         userId: payload.userId, delta: 1)
            }
            .store(in: &cancellables)

        // Symetrique : `status:unreacted` etait publie par le SDK sans AUCUN
        // abonne, donc un retrait de reaction ne se voyait qu'apres un
        // rechargement REST — et jamais hors-ligne.
        socialSocket.statusUnreacted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                self?.applyReactionDelta(statusId: payload.statusId, emoji: payload.emoji,
                                         userId: payload.userId, delta: -1)
            }
            .store(in: &cancellables)
    }

    private func applyReactionDelta(statusId: String, emoji: String, userId: String, delta: Int) {
        guard userId != authManager.currentUser?.id,
              let index = statuses.firstIndex(where: { $0.id == statusId }) else { return }
        statuses[index].reactionSummary = Self.applyingReaction(
            emoji: emoji, delta: delta, to: statuses[index].reactionSummary
        )
        persistSnapshot()
    }

    /// Toute mutation temps reel de `statuses` doit atteindre le disque : les
    /// quatre sinks ne muteraient que le tableau `@Published`, si bien qu'un
    /// mood cree, supprime ou reagi pendant la session disparaissait au
    /// prochain demarrage a froid (le cache gardait l'instantane REST).
    private func persistSnapshot() {
        Task { await saveCacheSnapshot() }
    }

    // MARK: - React to Status

    func reactToStatus(_ statusId: String, emoji: String) async {
        // Optimistic : refleter la reaction dans reactionSummary avant le reseau
        // (parite avec les reactions de post/commentaire). Snapshot pour rollback.
        let previousSummary = statuses.first(where: { $0.id == statusId })?.reactionSummary
        if let index = statuses.firstIndex(where: { $0.id == statusId }) {
            var summary = statuses[index].reactionSummary ?? [:]
            summary[emoji, default: 0] += 1
            statuses[index].reactionSummary = summary
        }
        do {
            try await statusService.react(statusId: statusId, emoji: emoji)
        } catch {
            // Rollback de l'optimisme + toast. (Sur succes, le broadcast
            // `status:reacted` reconcilie l'etat autoritaire cote serveur.)
            if let index = statuses.firstIndex(where: { $0.id == statusId }) {
                statuses[index].reactionSummary = previousSummary
            }
            FeedbackToastManager.shared.showError(String(localized: "status.reactError", defaultValue: "Error reacting to status", bundle: .main))
        }
    }

}
