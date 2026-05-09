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
    private var receivedOffset = 0
    private var sentOffset = 0
    private let pageSize = 30

    /// In-flight silent revalidation tasks, kicked off when the cache returns
    /// `.stale`. Cancelled on `deinit` so a teardown mid-flight doesn't keep
    /// rewriting state on a discarded ViewModel.
    private var receivedRevalidationTask: Task<Void, Never>?
    private var sentRevalidationTask: Task<Void, Never>?

    private let receivedKey = "requests:received"
    private let sentKey = "requests:sent"

    init(friendService: FriendServiceProviding = FriendService.shared) {
        self.friendService = friendService
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

    // MARK: - Accept

    func accept(requestId: String) async {
        let snapshot = receivedRequests
        receivedRequests.removeAll { $0.id == requestId }
        HapticFeedback.success()
        do {
            _ = try await friendService.respond(requestId: requestId, accepted: true)
            ToastManager.shared.showSuccess("Connexion acceptee")
        } catch {
            receivedRequests = snapshot
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible d'accepter")
        }
    }

    // MARK: - Reject

    func reject(requestId: String) async {
        let snapshot = receivedRequests
        receivedRequests.removeAll { $0.id == requestId }
        HapticFeedback.medium()
        do {
            _ = try await friendService.respond(requestId: requestId, accepted: false)
            ToastManager.shared.showSuccess("Demande refusee")
        } catch {
            receivedRequests = snapshot
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible de refuser")
        }
    }

    // MARK: - Cancel

    func cancel(requestId: String) async {
        let snapshot = sentRequests
        sentRequests.removeAll { $0.id == requestId }
        HapticFeedback.medium()
        do {
            try await friendService.deleteRequest(requestId: requestId)
            ToastManager.shared.showSuccess("Demande annulee")
        } catch {
            sentRequests = snapshot
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible d'annuler")
        }
    }
}
