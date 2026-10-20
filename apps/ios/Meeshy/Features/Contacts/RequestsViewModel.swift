import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

@MainActor
final class RequestsViewModel: ObservableObject {
    @Published var receivedRequests: [FriendRequest] = []
    @Published var sentRequests: [FriendRequest] = []
    @Published var loadState: LoadState = .idle
    @Published var receivedHasMore = true
    @Published var sentHasMore = true

    private let friendService: FriendServiceProviding
    /// Injected so tests can drive the accept/reject outbox path (enqueue
    /// success/failure + terminal outcome) deterministically, mirroring the
    /// pattern used by FeedViewModel / StatusViewModel / EditProfileViewModel.
    private let offlineQueue: OfflineQueueing
    private var profileRepaintSubscription: AnyCancellable?
    private var receivedOffset = 0
    /// Rang SERVEUR de la page suivante des demandes envoyées : la route les
    /// rend tous statuts confondus et la liste ne garde que celles en attente,
    /// donc le nombre de lignes affichées n'est pas un rang (#8026).
    private var sentOffset = 0
    private var isLoadingMoreReceived = false
    private var isLoadingMoreSent = false
    private let pageSize = 30
    /// Pages servies sans aucune demande en attente qu'un même bas de liste
    /// peut enchaîner : la dernière ligne ne réapparaît pas tant que rien ne
    /// s'ajoute, donc une page « vide » ne doit pas arrêter le défilement.
    private let maxSentPagesPerReach = 5

    /// In-flight silent revalidation tasks, kicked off when the cache returns
    /// `.stale`. Cancelled on `deinit` so a teardown mid-flight doesn't keep
    /// rewriting state on a discarded ViewModel.
    private var receivedRevalidationTask: Task<Void, Never>?
    private var sentRevalidationTask: Task<Void, Never>?

    private let receivedKey = FriendshipCache.PersistenceKeys.receivedRequests
    private let sentKey = FriendshipCache.PersistenceKeys.sentRequests

    private static let logger = MeeshyLog.logger(.requests)

    init(
        friendService: FriendServiceProviding = FriendService.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        profileUpdates: AnyPublisher<UserUpdatedEvent, Never> = MessageSocketManager.shared.userUpdated.eraseToAnyPublisher()
    ) {
        self.friendService = friendService
        self.offlineQueue = offlineQueue
        profileRepaintSubscription = profileUpdates
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.repaint(with: event) }
    }

    /// #9307 — la partie renommée ou repeinte d'une demande l'est sans
    /// relecture ; une liste intacte n'est pas republiée.
    private func repaint(with event: UserUpdatedEvent) {
        if let received = receivedRequests.repaintedElements(by: event.repainted) { receivedRequests = received }
        if let sent = sentRequests.repaintedElements(by: event.repainted) { sentRequests = sent }
    }

    deinit {
        receivedRevalidationTask?.cancel()
        sentRevalidationTask?.cancel()
    }

    // MARK: - Load Received

    func loadReceived(forceNetwork: Bool = false) async {
        receivedOffset = 0
        let friendService = self.friendService
        let pageSize = self.pageSize
        let store = await CacheCoordinator.shared.friendRequests
        let loader = CacheFirstLoader(store: store, key: receivedKey)
        receivedRevalidationTask?.cancel()
        let fetch: @Sendable () async throws -> [FriendRequest] = {
            let response = try await friendService.receivedRequests(offset: 0, limit: pageSize)
            return response.data
        }
        let setLoadState: @MainActor @Sendable (LoadState) -> Void = { [weak self] state in
            self?.loadState = state
        }
        let apply: @MainActor @Sendable ([FriendRequest]) -> Void = { [weak self] requests in
            guard let self else { return }
            self.receivedRequests = requests
            self.receivedOffset = requests.count
            // hasMore: assume more if we filled the page; refined by network response
            self.receivedHasMore = requests.count >= pageSize
        }
        if forceNetwork {
            await loader.refresh(fetch: fetch, setLoadState: setLoadState, apply: apply)
            return
        }
        receivedRevalidationTask = await loader.load(fetch: fetch, setLoadState: setLoadState, apply: apply)
    }

    func loadMoreReceived() async {
        guard receivedHasMore, !isLoadingMoreReceived else { return }
        isLoadingMoreReceived = true
        defer { isLoadingMoreReceived = false }
        do {
            let response = try await friendService.receivedRequests(offset: receivedOffset, limit: pageSize)
            receivedRequests = Self.appendingNew(response.data, to: receivedRequests)
            receivedHasMore = response.pagination?.hasMore ?? false
            receivedOffset += response.data.count
        } catch {
            Self.logger.error("loadMoreReceived failed: \(error.localizedDescription)")
            receivedHasMore = false
        }
    }

    // MARK: - Bas de liste (#8026)

    /// Une ligne de la liste reçue vient d'apparaître : la dernière charge la
    /// page suivante.
    func receivedRowAppeared(id: String) async {
        guard receivedRequests.last?.id == id else { return }
        await loadMoreReceived()
    }

    /// Une ligne de la liste envoyée vient d'apparaître : la dernière charge la
    /// page suivante.
    func sentRowAppeared(id: String) async {
        guard sentRequests.last?.id == id else { return }
        await loadMoreSent()
    }

    func loadMoreSent() async {
        guard sentHasMore, !isLoadingMoreSent else { return }
        isLoadingMoreSent = true
        defer { isLoadingMoreSent = false }
        for _ in 0..<maxSentPagesPerReach {
            do {
                let response = try await friendService.sentRequests(offset: sentOffset, limit: pageSize)
                let before = sentRequests.count
                sentRequests = Self.appendingNew(response.data.filter { $0.status == "pending" }, to: sentRequests)
                sentOffset += response.data.count
                sentHasMore = !response.data.isEmpty && (response.pagination?.hasMore ?? (response.data.count >= pageSize))
                guard sentRequests.count == before, sentHasMore else { return }
            } catch {
                Self.logger.error("loadMoreSent failed: \(error.localizedDescription)")
                sentHasMore = false
                return
            }
        }
    }

    /// Ajoute les demandes d'une page suivante, sans reprendre celles déjà
    /// affichées : une demande arrivée entre deux pages décale les rangs serveur.
    nonisolated static func appendingNew(_ page: [FriendRequest], to shown: [FriendRequest]) -> [FriendRequest] {
        let known = Set(shown.map(\.id))
        return shown + page.filter { !known.contains($0.id) }
    }

    private func noteSentFirstPage(servedCount: Int, hasMore: Bool) {
        sentOffset = servedCount
        sentHasMore = hasMore
    }

    // MARK: - Load Sent

    func loadSent(forceNetwork: Bool = false) async {
        let friendService = self.friendService
        let pageSize = self.pageSize
        let store = await CacheCoordinator.shared.friendRequests
        let loader = CacheFirstLoader(store: store, key: sentKey)
        sentRevalidationTask?.cancel()
        let fetch: @Sendable () async throws -> [FriendRequest] = { [weak self] in
            let response = try await friendService.sentRequests(offset: 0, limit: pageSize)
            let servedCount = response.data.count
            let hasMore = response.pagination?.hasMore ?? (servedCount >= pageSize)
            await self?.noteSentFirstPage(servedCount: servedCount, hasMore: hasMore)
            // Filter pending only — historical filter preserved.
            return response.data.filter { $0.status == "pending" }
        }
        let setLoadState: @MainActor @Sendable (LoadState) -> Void = { _ in
            // Sent list intentionally does not drive `loadState`; the
            // received list is the canonical loading surface for the
            // Requests tab. Network failures here are silent.
        }
        let apply: @MainActor @Sendable ([FriendRequest]) -> Void = { [weak self] requests in
            guard let self else { return }
            self.sentRequests = requests
        }
        if forceNetwork {
            await loader.refresh(fetch: fetch, setLoadState: setLoadState, apply: apply)
            return
        }
        sentRevalidationTask = await loader.load(fetch: fetch, setLoadState: setLoadState, apply: apply)
    }

    // MARK: - Accept / Reject (Wave 1 Phase B)
    //
    // Accept / Reject flow through the offline outbox. The list is
    // updated optimistically and a `.respondFriendRequest` row is
    // enqueued ; the OutboxFlusher fires the gateway PATCH with
    // `X-Client-Mutation-Id` so a transient network failure replays
    // safely without producing a duplicate. The success toast fires
    // immediately because from the user's perspective the action is
    // done — the OutboxFlusher cleans up the wire side in the background.

    func accept(requestId: String) async {
        let removal = RequestRemoval(requestId, in: receivedRequests)
        let cmid = ClientMutationId.generate()
        // Capture the senderId AND the full FriendRequestUser BEFORE we
        // remove the row — we need senderId to flip the FriendshipCache and
        // the user record to optimistically inject the new contact into the
        // friends GRDB cache so it survives an app relaunch even before the
        // network round-trip completes.
        let acceptedRequest = receivedRequests.first(where: { $0.id == requestId })
        let senderId = acceptedRequest?.senderId
        let acceptedSender = acceptedRequest?.sender
        receivedRequests.removeAll { $0.id == requestId }
        if acceptedRequest != nil { receivedOffset = max(0, receivedOffset - 1) }
        if let senderId {
            FriendshipCache.shared.didAcceptRequest(from: senderId)
        }
        // Invalidate FIRST so any stale `.fresh` entries don't mask the
        // mutation; then persist the optimistic friend record. The save
        // re-stamps the entry as fresh, so the next cold-load (e.g. user
        // closes/relaunches the app offline) sees the new contact without
        // hitting the gateway. If we persisted first and invalidated after,
        // the invalidation would mark our optimistic write as expired —
        // defeating the whole point of the persist.
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
        if let acceptedSender {
            await Self.persistAcceptedFriend(acceptedSender)
        }
        HapticFeedback.success()
        observeOutcome(
            cmid: cmid,
            rollback: { [weak self] in
                self?.restoreReceived(removal)
                if let senderId {
                    FriendshipCache.shared.rollbackAccept(senderId: senderId, requestId: requestId)
                }
            },
            toast: String(localized: "contacts.requests.accept.rollback", defaultValue: "Impossible d'accepter cette demande", bundle: .main)
        )
        let payload = RespondFriendRequestPayload(
            clientMutationId: cmid,
            friendRequestId: requestId,
            action: .accept
        )
        do {
            try await offlineQueue.enqueue(.respondFriendRequest, payload: payload, conversationId: nil)
            FeedbackToastManager.shared.showSuccess(String(localized: "contacts.requests.accept.success", defaultValue: "Connexion acceptée", bundle: .main))
        } catch {
            restoreReceived(removal)
            if let senderId {
                FriendshipCache.shared.rollbackAccept(senderId: senderId, requestId: requestId)
            }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(String(localized: "contacts.requests.accept.error", defaultValue: "Impossible d'accepter", bundle: .main))
        }
    }

    func reject(requestId: String) async {
        let removal = RequestRemoval(requestId, in: receivedRequests)
        let cmid = ClientMutationId.generate()
        let rejected = receivedRequests.first(where: { $0.id == requestId })
        let senderId = rejected?.senderId
        receivedRequests.removeAll { $0.id == requestId }
        if rejected != nil { receivedOffset = max(0, receivedOffset - 1) }
        if let senderId {
            FriendshipCache.shared.didRejectRequest(from: senderId)
        }
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
        HapticFeedback.medium()
        observeOutcome(
            cmid: cmid,
            rollback: { [weak self] in
                self?.restoreReceived(removal)
                if let senderId {
                    FriendshipCache.shared.rollbackReject(senderId: senderId, requestId: requestId)
                }
            },
            toast: String(localized: "contacts.requests.reject.rollback", defaultValue: "Impossible de refuser cette demande", bundle: .main)
        )
        let payload = RespondFriendRequestPayload(
            clientMutationId: cmid,
            friendRequestId: requestId,
            action: .reject
        )
        do {
            try await offlineQueue.enqueue(.respondFriendRequest, payload: payload, conversationId: nil)
            FeedbackToastManager.shared.showSuccess(String(localized: "contacts.requests.reject.success", defaultValue: "Demande refusée", bundle: .main))
        } catch {
            restoreReceived(removal)
            if let senderId {
                FriendshipCache.shared.rollbackReject(senderId: senderId, requestId: requestId)
            }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(String(localized: "contacts.requests.reject.error", defaultValue: "Impossible de refuser", bundle: .main))
        }
    }

    // MARK: - Outcome Observer (Phase 4 Task 4.9)

    /// Subscribes to `OfflineQueue.outcomeStream(for: cmid)` and rolls back
    /// the optimistic mutation if the OutboxFlusher escalates the row to
    /// `.exhausted` after exhausting its retry budget. `.applied` events are
    /// a no-op (the optimistic state is already the final state).
    private func observeOutcome(
        cmid: String,
        rollback: @escaping @MainActor () -> Void,
        toast: String
    ) {
        let offlineQueue = self.offlineQueue
        Task { @MainActor in
            let stream = await offlineQueue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollback()
                    FeedbackToastManager.shared.showError(toast)
                    HapticFeedback.error()
                }
            }
        }
    }

    // MARK: - Cancel

    func cancel(requestId: String) async {
        let removal = RequestRemoval(requestId, in: sentRequests)
        // Capture receiverId before removing so we can flip cache state and
        // roll back on failure.
        let receiverId = sentRequests.first(where: { $0.id == requestId })?.receiverId
        sentRequests.removeAll { $0.id == requestId }
        if let receiverId {
            FriendshipCache.shared.didCancelRequest(to: receiverId)
        }
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
        HapticFeedback.medium()
        do {
            try await friendService.deleteRequest(requestId: requestId)
            // La ligne retirée côté serveur décale d'un rang la page suivante (#8026).
            if receiverId != nil { sentOffset = max(0, sentOffset - 1) }
            FeedbackToastManager.shared.showSuccess(String(localized: "contacts.requests.cancel.success", defaultValue: "Demande annulée", bundle: .main))
        } catch {
            if let removal { sentRequests = OptimisticRollback.restoring(removal.request, at: removal.index, into: sentRequests) }
            if let receiverId {
                FriendshipCache.shared.didSendRequest(to: receiverId, requestId: requestId)
            }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(String(localized: "contacts.requests.cancel.error", defaultValue: "Impossible d'annuler", bundle: .main))
        }
    }

    // MARK: - Rollback d'UNE ligne

    /// La demande retirée et sa place, pour la remettre SEULE si la file la
    /// refuse. L'instantané de toute la liste ramenait aussi les demandes
    /// traitées entre-temps (accepter A puis B, A refusée → B revenait) et
    /// effaçait les pages chargées depuis.
    struct RequestRemoval {
        let request: FriendRequest
        let index: Int

        init?(_ requestId: String, in requests: [FriendRequest]) {
            guard let index = requests.firstIndex(where: { $0.id == requestId }) else { return nil }
            self.request = requests[index]
            self.index = index
        }
    }

    private func restoreReceived(_ removal: RequestRemoval?) {
        guard let removal else { return }
        let before = receivedRequests.count
        receivedRequests = OptimisticRollback.restoring(removal.request, at: removal.index, into: receivedRequests)
        if receivedRequests.count > before { receivedOffset += 1 }
    }

    // MARK: - Optimistic Friend Persistence

    /// Merge the accepted sender into the persistent `friends_list` GRDB
    /// cache so Contacts can show the new contact on its next cold load,
    /// without having to wait for `ContactsListViewModel` to observe the
    /// mutation and trigger a network refetch. Read-merge-write under the
    /// store's actor isolation.
    private static func persistAcceptedFriend(_ user: FriendRequestUser) async {
        let store = await CacheCoordinator.shared.friends
        let key = FriendshipCache.PersistenceKeys.friendsList
        let existing = await store.load(for: key).snapshot() ?? []
        guard !existing.contains(where: { $0.id == user.id }) else { return }
        var merged = existing
        merged.append(user)
        try? await store.save(merged, for: key)
    }
}
