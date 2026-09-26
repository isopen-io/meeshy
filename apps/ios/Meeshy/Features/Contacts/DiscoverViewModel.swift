import SwiftUI
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
    private(set) var hasImportedContacts = false

    /// Backwards-compatibility shim — earlier consumers read `isSearching`
    /// directly. Derived from `loadState` so existing call sites keep
    /// working without churn.
    var isSearching: Bool { loadState == .loading }

    private let friendService: FriendServiceProviding
    private let userService: UserServiceProviding
    private let contactSync: ContactSyncProviding
    private let directoryService: ContactDirectoryServiceProviding

    private var suggestionsRevalidationTask: Task<Void, Never>?
    private let suggestionsKey = "discover:suggestions"

    init(
        friendService: FriendServiceProviding = FriendService.shared,
        userService: UserServiceProviding = UserService.shared,
        contactSync: ContactSyncProviding = ContactSyncService.shared,
        directoryService: ContactDirectoryServiceProviding = ContactDirectoryService.shared
    ) {
        self.friendService = friendService
        self.userService = userService
        self.contactSync = contactSync
        self.directoryService = directoryService
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
        // Une recherche tapée prend la main : toute revalidation de
        // suggestions encore en vol écraserait ses résultats en atterrissant.
        suggestionsRevalidationTask?.cancel()
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
    func loadSuggestions(forceNetwork: Bool = false) async {
        let userService = self.userService
        let store = await CacheCoordinator.shared.userSearch
        let loader = CacheFirstLoader(store: store, key: suggestionsKey)
        suggestionsRevalidationTask?.cancel()
        let fetch: @Sendable () async throws -> [UserSearchResult] = {
            // Empty query returns the gateway's "discover" suggestions
            // (recent active, mutual friends, etc.).
            try await userService.searchUsers(query: "", limit: 20, offset: 0)
        }
        let setLoadState: @MainActor @Sendable (LoadState) -> Void = { [weak self] state in
            self?.loadState = state
        }
        // Suggestions et résultats de recherche partagent `searchResults` :
        // si l'utilisateur a tapé une requête pendant que la revalidation
        // était en vol, ses résultats ne doivent pas être écrasés par la
        // liste de suggestions à requête vide.
        let apply: @MainActor @Sendable ([UserSearchResult]) -> Void = { [weak self] users in
            guard let self, self.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            self.searchResults = users
        }
        if forceNetwork {
            await loader.refresh(fetch: fetch, setLoadState: setLoadState, apply: apply)
            return
        }
        suggestionsRevalidationTask = await loader.load(fetch: fetch, setLoadState: setLoadState, apply: apply)
    }

    // MARK: - Email Invitation

    func sendEmailInvitation() async {
        let email = emailText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else { return }
        isSendingInvite = true
        do {
            try await friendService.sendEmailInvitation(email: email)
            FeedbackToastManager.shared.showSuccess(String(localized: "contacts.discover.invite.sent", defaultValue: "Invitation envoyée à \(email)", bundle: .main))
            emailText = ""
            HapticFeedback.success()
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "contacts.discover.invite.error", defaultValue: "Impossible d'envoyer l'invitation", bundle: .main))
            HapticFeedback.error()
        }
        isSendingInvite = false
    }

    // MARK: - Contact Import (carnet d'adresses → suggestions)

    /// Demande l'accès aux contacts (hors main thread, géré par le service),
    /// SYNCHRONISE le carnet dans le répertoire persisté, puis affiche ceux qui
    /// ont déjà un compte Meeshy.
    ///
    /// Une seule lecture du carnet, un seul appel : la synchronisation fait le
    /// rapprochement ET la conservation. Le carnet part ensuite en autant de
    /// LOTS réseau que sa taille l'exige (`ContactSyncService`), ce qui ne
    /// change rien ici — `.replace` reste le vœu « miroir de l'appareil », que
    /// le dernier lot réalise par sa purge. Les correspondances affichées sont
    /// relues du répertoire — l'utilisateur les retrouve ensuite dans l'onglet
    /// Répertoire, sans avoir à re-scanner son appareil.
    func importContacts() async {
        guard !isImportingContacts else { return }
        isImportingContacts = true
        defer { isImportingContacts = false }
        do {
            _ = try await contactSync.syncDirectory(mode: .replace)
            // Toutes les pages (plus de plafond à 200 — 2026-08-21).
            let directory = try await directoryService.listAll(filter: .meeshy, query: nil)
            contactMatches = directory.compactMap(\.asContactMatch)
            hasImportedContacts = true
            if contactMatches.isEmpty {
                FeedbackToastManager.shared.show(String(localized: "contacts.discover.import.none", defaultValue: "Aucun de tes contacts n'est encore sur Meeshy — invite-les !", bundle: .main), type: .success)
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
