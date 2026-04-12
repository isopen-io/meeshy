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

    init(friendService: FriendServiceProviding = FriendService.shared) {
        self.friendService = friendService
    }

    // MARK: - Load Received

    func loadReceived() async {
        loadState = .loading
        receivedOffset = 0
        do {
            let response = try await friendService.receivedRequests(offset: 0, limit: pageSize)
            receivedRequests = response.data
            receivedHasMore = response.pagination?.hasMore ?? false
            receivedOffset = response.data.count
            loadState = .loaded
        } catch {
            loadState = .error("Erreur lors du chargement")
        }
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
        do {
            let response = try await friendService.sentRequests(offset: 0, limit: pageSize)
            sentRequests = response.data.filter { $0.status == "pending" }
            sentHasMore = response.pagination?.hasMore ?? false
            sentOffset = response.data.count
        } catch {}
    }

    func loadMoreSent() async {
        guard sentHasMore else { return }
        do {
            let response = try await friendService.sentRequests(offset: sentOffset, limit: pageSize)
            let pending = response.data.filter { $0.status == "pending" }
            sentRequests.append(contentsOf: pending)
            sentHasMore = response.pagination?.hasMore ?? false
            sentOffset += response.data.count
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
