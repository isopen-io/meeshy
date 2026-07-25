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
    /// Injected so tests can drive the send-request outbox path (enqueue
    /// success/failure + terminal `.exhausted` outcome) deterministically,
    /// mirroring `RequestsViewModel`'s accept/reject pattern.
    private let offlineQueue: OfflineQueueing
    private var cancellables: Set<AnyCancellable> = []

    private var suggestionsRevalidationTask: Task<Void, Never>?
    private let suggestionsKey = "discover:suggestions"

    init(
        friendService: FriendServiceProviding = FriendService.shared,
        userService: UserServiceProviding = UserService.shared,
        contactSync: ContactSyncProviding = ContactSyncService.shared,
        resolver: UserRelationshipResolver = .shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared
    ) {
        self.friendService = friendService
        self.userService = userService
        self.contactSync = contactSync
        self.resolver = resolver
        self.offlineQueue = offlineQueue
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

    /// Routed through the `.sendFriendRequest` outbox (dispatcher already
    /// implemented — `OutboxDispatcher.dispatchSendFriendRequest` — but
    /// nothing enqueued it: this call site posted `FriendService` directly,
    /// so an offline tap failed with a toast and lost the request). The
    /// cache flips to `.pendingSent` — and the success haptic fires —
    /// BEFORE the network attempt, matching the optimistic-update principle
    /// (capture → apply local → send → rollback on failure) instead of the
    /// old ordering where the haptic fired with no accompanying state
    /// change at all, well before the request even reached the network.
    ///
    /// `requestId` for the optimistic cache entry is the `clientMutationId`
    /// — the real gateway-assigned friend-request id isn't known until the
    /// outbox flushes, and the outcome stream only carries the terminal
    /// cmid, not a result payload. This is sufficient for the common paths
    /// (row shows "En attente", `RequestsTab`/notifications reconcile the
    /// real id on next load) — cancelling a request that is STILL queued
    /// offline (not yet flushed) is a known narrow gap, unchanged from
    /// before this fix.
    func sendRequest(to userId: String) async {
        let cmid = ClientMutationId.generate()
        cache.didSendRequest(to: userId, requestId: cmid)
        objectWillChange.send()
        HapticFeedback.success()
        observeSendRequestOutcome(
            cmid: cmid,
            rollback: { [weak self] in
                self?.cache.didCancelRequest(to: userId)
                self?.objectWillChange.send()
            }
        )
        let payload = SendFriendRequestPayload(clientMutationId: cmid, targetUserId: userId)
        do {
            try await offlineQueue.enqueue(.sendFriendRequest, payload: payload, conversationId: nil)
            FeedbackToastManager.shared.showSuccess("Demande envoyee")
        } catch {
            cache.didCancelRequest(to: userId)
            objectWillChange.send()
            HapticFeedback.error()
            FeedbackToastManager.shared.showError("Impossible d'envoyer")
        }
    }

    /// Mirrors `RequestsViewModel.observeOutcome`: subscribes to the
    /// outbox's terminal-event stream for `cmid` and rolls back the
    /// optimistic cache entry if the OutboxFlusher exhausts its retry
    /// budget. `.applied` is a no-op — the optimistic state is already the
    /// final state.
    private func observeSendRequestOutcome(
        cmid: String,
        rollback: @escaping @MainActor () -> Void
    ) {
        let offlineQueue = self.offlineQueue
        Task { @MainActor in
            let stream = await offlineQueue.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollback()
                    FeedbackToastManager.shared.showError("Impossible d'envoyer")
                    HapticFeedback.error()
                }
            }
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
