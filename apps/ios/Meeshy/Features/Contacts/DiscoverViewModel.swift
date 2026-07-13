import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class DiscoverViewModel: ObservableObject {
    @Published var searchResults: [UserSearchResult] = []
    @Published var searchQuery: String = ""
    @Published var loadState: LoadState = .idle
    @Published var emailText: String = ""
    @Published var phoneText: String = ""
    @Published var isSendingInvite = false
    @Published var contactMatches: [ContactMatch] = []
    @Published var isImportingContacts = false
    @Published var hasImportedContacts = false

    /// Backwards-compatibility shim — earlier consumers read `isSearching`
    /// directly. Derived from `loadState` so existing call sites keep
    /// working without churn.
    var isSearching: Bool { loadState == .loading }

    private let friendService: FriendServiceProviding
    private let userService: UserServiceProviding
    private let contactSync: ContactSyncProviding
    private let cache = FriendshipCache.shared
    private let resolver: UserRelationshipResolver
    private var cancellables: Set<AnyCancellable> = []

    private var suggestionsRevalidationTask: Task<Void, Never>?
    private let suggestionsKey = "discover:suggestions"

    init(
        friendService: FriendServiceProviding = FriendService.shared,
        userService: UserServiceProviding = UserService.shared,
        contactSync: ContactSyncProviding = ContactSyncService.shared,
        resolver: UserRelationshipResolver = .shared
    ) {
        self.friendService = friendService
        self.userService = userService
        self.contactSync = contactSync
        self.resolver = resolver
        // Bridge external state changes into our own objectWillChange so the
        // Discover row badges flip when a request is accepted/blocked from
        // any other screen (Requests tab, profile sheet, push notification).
        // Without this, `relationshipState(for:)` would return the right
        // value but SwiftUI wouldn't know to re-evaluate the row.
        //
        // `.receive(on: DispatchQueue.main)` hops the value to MainActor
        // before we touch `objectWillChange` — `@MainActor` isolation
        // requires it, and the publisher emits from whatever queue mutated
        // the cache.
        cache.$version
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        BlockService.shared.$blockedUserIds
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
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

    /// Resolves the relationship state for a search result row. Combines
    /// friendship + block state into a single value via the shared resolver,
    /// so Discover stays consistent with the rest of the app.
    func relationshipState(for userId: String) -> UserRelationshipState {
        resolver.resolve(userId: userId)
    }

    // MARK: - Send Friend Request

    func sendRequest(to userId: String) async {
        HapticFeedback.success()
        do {
            let request = try await friendService.sendFriendRequest(receiverId: userId, message: nil)
            cache.didSendRequest(to: userId, requestId: request.id)
            objectWillChange.send()
            FeedbackToastManager.shared.showSuccess("Demande envoyee")
        } catch {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError("Impossible d'envoyer")
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
            FeedbackToastManager.shared.showSuccess("Connexion acceptee")
        } catch {
            cache.rollbackAccept(senderId: userId, requestId: requestId)
            objectWillChange.send()
            HapticFeedback.error()
            FeedbackToastManager.shared.showError("Impossible d'accepter")
        }
    }

    // MARK: - Email Invitation

    func sendEmailInvitation() async {
        let email = emailText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else { return }
        isSendingInvite = true
        do {
            try await friendService.sendEmailInvitation(email: email)
            FeedbackToastManager.shared.showSuccess("Invitation envoyee a \(email)")
            emailText = ""
            HapticFeedback.success()
        } catch {
            FeedbackToastManager.shared.showError("Impossible d'envoyer l'invitation")
            HapticFeedback.error()
        }
        isSendingInvite = false
    }

    // MARK: - Contact Import (carnet d'adresses → suggestions)

    /// Demande l'accès aux contacts (hors main thread, géré par le service),
    /// puis matche le carnet contre les comptes Meeshy existants.
    func importContacts() async {
        guard !isImportingContacts else { return }
        isImportingContacts = true
        defer { isImportingContacts = false }
        do {
            contactMatches = try await contactSync.findFriendsFromContacts()
            hasImportedContacts = true
            if contactMatches.isEmpty {
                FeedbackToastManager.shared.show(String(localized: "contacts.discover.import.none", defaultValue: "Aucun de tes contacts n'est encore sur Meeshy — invite-les!", bundle: .main), type: .success)
            } else {
                HapticFeedback.success()
            }
        } catch let error as ContactSyncError {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(error.localizedDescription)
        } catch {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(String(localized: "contacts.discover.import.failed", defaultValue: "Impossible d'importer les contacts", bundle: .main))
        }
    }

    // MARK: - SMS Message

    var smsMessage: String {
        "Rejoins-moi sur Meeshy ! Telecharge l'app : https://meeshy.me/download"
    }
}
