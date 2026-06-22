import SwiftUI
import Combine
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
    private var receivedOffset = 0
    private var sentOffset = 0
    private let pageSize = 30

    /// In-flight silent revalidation tasks, kicked off when the cache returns
    /// `.stale`. Cancelled on `deinit` so a teardown mid-flight doesn't keep
    /// rewriting state on a discarded ViewModel.
    private var receivedRevalidationTask: Task<Void, Never>?
    private var sentRevalidationTask: Task<Void, Never>?

    private let receivedKey = FriendshipCache.PersistenceKeys.receivedRequests
    private let sentKey = FriendshipCache.PersistenceKeys.sentRequests

    init(
        friendService: FriendServiceProviding = FriendService.shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared
    ) {
        self.friendService = friendService
        self.offlineQueue = offlineQueue
    }

    deinit {
        receivedRevalidationTask?.cancel()
        sentRevalidationTask?.cancel()
    }

    // MARK: - Load Received

    func loadReceived() async {
        receivedOffset = 0
        let friendService = self.friendService
        let pageSize = self.pageSize
        let store = await CacheCoordinator.shared.friendRequests
        let loader = CacheFirstLoader(store: store, key: receivedKey)
        receivedRevalidationTask?.cancel()
        receivedRevalidationTask = await loader.load(
            fetch: {
                let response = try await friendService.receivedRequests(offset: 0, limit: pageSize)
                return response.data
            },
            setLoadState: { [weak self] state in
                self?.loadState = state
            },
            apply: { [weak self] requests in
                guard let self else { return }
                self.receivedRequests = requests
                self.receivedOffset = requests.count
                // hasMore: assume more if we filled the page; refined by network response
                self.receivedHasMore = requests.count >= pageSize
            }
        )
    }

    func loadMoreReceived() async {
        guard receivedHasMore else { return }
        do {
            let response = try await friendService.receivedRequests(offset: receivedOffset, limit: pageSize)
            receivedRequests.append(contentsOf: response.data)
            receivedHasMore = response.pagination?.hasMore ?? false
            receivedOffset += response.data.count
        } catch {}
    }

    // MARK: - Load Sent

    func loadSent() async {
        sentOffset = 0
        let friendService = self.friendService
        let pageSize = self.pageSize
        let store = await CacheCoordinator.shared.friendRequests
        let loader = CacheFirstLoader(store: store, key: sentKey)
        sentRevalidationTask?.cancel()
        sentRevalidationTask = await loader.load(
            fetch: {
                let response = try await friendService.sentRequests(offset: 0, limit: pageSize)
                // Filter pending only — historical filter preserved.
                return response.data.filter { $0.status == "pending" }
            },
            setLoadState: { _ in
                // Sent list intentionally does not drive `loadState`; the
                // received list is the canonical loading surface for the
                // Requests tab. Network failures here are silent.
            },
            apply: { [weak self] requests in
                guard let self else { return }
                self.sentRequests = requests
                self.sentOffset = requests.count
                self.sentHasMore = requests.count >= pageSize
            }
        )
    }

    func loadMoreSent() async {
        guard sentHasMore else { return }
        do {
            let response = try await friendService.sentRequests(offset: sentOffset, limit: pageSize)
            let pending = response.data.filter { $0.status == "pending" }
            sentRequests.append(contentsOf: pending)
            sentHasMore = response.pagination?.hasMore ?? false
            // `sentOffset` tracks the FILTERED count (pending only) — `loadSent`
            // initialises it to `requests.count` (post-filter). Incrementing by
            // the unfiltered `response.data.count` would skip pending items the
            // server returned on the previous page, dropping rows from the UI.
            sentOffset += pending.count
        } catch {}
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
        let snapshot = receivedRequests
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
                self?.receivedRequests = snapshot
                if let senderId {
                    FriendshipCache.shared.rollbackAccept(senderId: senderId, requestId: requestId)
                }
            },
            toast: "Impossible d'accepter cette demande"
        )
        let payload = RespondFriendRequestPayload(
            clientMutationId: cmid,
            friendRequestId: requestId,
            action: .accept
        )
        do {
            try await offlineQueue.enqueue(.respondFriendRequest, payload: payload, conversationId: nil)
            FeedbackToastManager.shared.showSuccess("Connexion acceptee")
        } catch {
            receivedRequests = snapshot
            if let senderId {
                FriendshipCache.shared.rollbackAccept(senderId: senderId, requestId: requestId)
            }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError("Impossible d'accepter")
        }
    }

    func reject(requestId: String) async {
        let snapshot = receivedRequests
        let cmid = ClientMutationId.generate()
        let senderId = receivedRequests.first(where: { $0.id == requestId })?.senderId
        receivedRequests.removeAll { $0.id == requestId }
        if let senderId {
            FriendshipCache.shared.didRejectRequest(from: senderId)
        }
        await FriendshipCache.shared.invalidatePersistedFriendCaches()
        HapticFeedback.medium()
        observeOutcome(
            cmid: cmid,
            rollback: { [weak self] in
                self?.receivedRequests = snapshot
                if let senderId {
                    FriendshipCache.shared.rollbackReject(senderId: senderId, requestId: requestId)
                }
            },
            toast: "Impossible de refuser cette demande"
        )
        let payload = RespondFriendRequestPayload(
            clientMutationId: cmid,
            friendRequestId: requestId,
            action: .reject
        )
        do {
            try await offlineQueue.enqueue(.respondFriendRequest, payload: payload, conversationId: nil)
            FeedbackToastManager.shared.showSuccess("Demande refusee")
        } catch {
            receivedRequests = snapshot
            if let senderId {
                FriendshipCache.shared.rollbackReject(senderId: senderId, requestId: requestId)
            }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError("Impossible de refuser")
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
        let snapshot = sentRequests
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
            FeedbackToastManager.shared.showSuccess("Demande annulee")
        } catch {
            sentRequests = snapshot
            if let receiverId {
                FriendshipCache.shared.didSendRequest(to: receiverId, requestId: requestId)
            }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError("Impossible d'annuler")
        }
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
