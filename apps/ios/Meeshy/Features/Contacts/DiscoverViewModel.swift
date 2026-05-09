import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

enum ContactConnectionStatus: Equatable {
    case connected
    case pendingSent
    case pendingReceived
    case none
}

@MainActor
final class DiscoverViewModel: ObservableObject {
    @Published var searchResults: [UserSearchResult] = []
    @Published var searchQuery: String = ""
    @Published var loadState: LoadState = .idle
    @Published var emailText: String = ""
    @Published var phoneText: String = ""
    @Published var isSendingInvite = false

    /// Backwards-compatibility shim — earlier consumers read `isSearching`
    /// directly. Derived from `loadState` so existing call sites keep
    /// working without churn.
    var isSearching: Bool { loadState == .loading }

    private let friendService: FriendServiceProviding
    private let userService: UserServiceProviding
    private let cache = FriendshipCache.shared

    private var suggestionsRevalidationTask: Task<Void, Never>?
    private let suggestionsKey = "discover:suggestions"

    init(
        friendService: FriendServiceProviding = FriendService.shared,
        userService: UserServiceProviding = UserService.shared
    ) {
        self.friendService = friendService
        self.userService = userService
    }

    deinit {
        suggestionsRevalidationTask?.cancel()
    }

    // MARK: - Search

    /// Network-backed search for the current `searchQuery`. Results are NOT
    /// cached because the query space is unbounded; only the empty-query
    /// suggestions list (`loadSuggestions`) goes through the cache-first
    /// pipeline.
    func performSearch() async {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2 else {
            searchResults = []
            return
        }
        loadState = .loading
        do {
            searchResults = try await userService.searchUsers(query: query, limit: 20, offset: 0)
            loadState = .loaded
        } catch {
            searchResults = []
            loadState = .error(error.localizedDescription)
        }
    }

    /// Cache-first load of the empty-query suggestion list. Hydrates
    /// `searchResults` from cache immediately when the user lands on the
    /// Discover tab without typing, and silently revalidates against the
    /// network in the background.
    func loadSuggestions() async {
        let userService = self.userService
        let store = await CacheCoordinator.shared.userSearch
        let loader = CacheFirstLoader(store: store, key: suggestionsKey)
        suggestionsRevalidationTask?.cancel()
        suggestionsRevalidationTask = await loader.load(
            fetch: {
                // Empty query returns the gateway's "discover" suggestions
                // (recent active, mutual friends, etc.).
                try await userService.searchUsers(query: "", limit: 20, offset: 0)
            },
            setLoadState: { [weak self] state in
                self?.loadState = state
            },
            apply: { [weak self] users in
                self?.searchResults = users
            }
        )
    }

    func connectionStatus(for userId: String) -> ContactConnectionStatus {
        switch cache.status(for: userId) {
        case .friend: return .connected
        case .pendingSent: return .pendingSent
        case .pendingReceived: return .pendingReceived
        case .none: return .none
        }
    }

    // MARK: - Send Friend Request

    func sendRequest(to userId: String) async {
        HapticFeedback.success()
        do {
            let request = try await friendService.sendFriendRequest(receiverId: userId, message: nil)
            cache.didSendRequest(to: userId, requestId: request.id)
            objectWillChange.send()
            ToastManager.shared.showSuccess("Demande envoyee")
        } catch {
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible d'envoyer")
        }
    }

    // MARK: - Accept Received Request

    func acceptReceivedRequest(from userId: String) async {
        let status = cache.status(for: userId)
        guard case .pendingReceived(let requestId) = status else { return }
        cache.didAcceptRequest(from: userId)
        objectWillChange.send()
        HapticFeedback.success()
        do {
            _ = try await friendService.respond(requestId: requestId, accepted: true)
            ToastManager.shared.showSuccess("Connexion acceptee")
        } catch {
            cache.rollbackAccept(senderId: userId, requestId: requestId)
            objectWillChange.send()
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible d'accepter")
        }
    }

    // MARK: - Email Invitation

    func sendEmailInvitation() async {
        let email = emailText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else { return }
        isSendingInvite = true
        do {
            try await friendService.sendEmailInvitation(email: email)
            ToastManager.shared.showSuccess("Invitation envoyee a \(email)")
            emailText = ""
            HapticFeedback.success()
        } catch {
            ToastManager.shared.showError("Impossible d'envoyer l'invitation")
            HapticFeedback.error()
        }
        isSendingInvite = false
    }

    // MARK: - SMS Message

    var smsMessage: String {
        "Rejoins-moi sur Meeshy ! Telecharge l'app : https://meeshy.me/download"
    }
}
