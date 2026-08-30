import SwiftUI
import Combine
import Contacts
import MeeshySDK
import MeeshyUI
import os

// `nonisolated` : `os.Logger` est un type valeur thread-safe (doc Apple) et ce
// journal est écrit depuis `DirectoryPaging`, marqué `nonisolated`.
private nonisolated let phonebookPagingLogger = Logger(subsystem: "me.meeshy.app", category: "phonebook")

/// Répertoire — le carnet d'adresses de l'appareil, synchronisé et CONSERVÉ
/// côté serveur, consultable sans re-scanner les contacts.
///
/// Cache-first : la liste s'affiche depuis le cache dès l'ouverture (même
/// périmée), la revalidation réseau se fait en silence. La synchronisation
/// (lecture du carnet + envoi) reste une action explicite de l'utilisateur —
/// on ne lit pas son carnet d'adresses derrière son dos.
@MainActor
final class PhonebookViewModel: ObservableObject {
    @Published private(set) var contacts: [DirectoryContact] = []
    @Published private(set) var loadState: LoadState = .idle
    @Published private(set) var isSyncing = false
    /// Utilisateurs de la plateforme trouvés par le RELAIS de recherche —
    /// alimenté seulement quand le répertoire ne répond pas à la requête.
    @Published private(set) var platformResults: [UserSearchResult] = []
    @Published private(set) var isSearchingPlatform = false
    @Published var activeFilter: DirectoryFilter = .all
    @Published var searchQuery: String = ""

    private let directoryService: ContactDirectoryServiceProviding
    private let contactSync: ContactSyncProviding
    private let userService: UserServiceProviding
    private let conversationCreator: ConversationCreating
    private let currentUserId: String
    private let cacheKey = "phonebook:all"
    private let searchDebounce: Duration
    private var revalidationTask: Task<Void, Never>?
    private var platformSearchTask: Task<Void, Never>?
    private var hasAttemptedInitialSync = false

    init(
        directoryService: ContactDirectoryServiceProviding = ContactDirectoryService.shared,
        contactSync: ContactSyncProviding = ContactSyncService.shared,
        userService: UserServiceProviding = UserService.shared,
        conversationCreator: ConversationCreating = ConversationCreator(),
        currentUserId: String = AuthManager.shared.currentUser?.id ?? "",
        searchDebounce: Duration = .milliseconds(300)
    ) {
        self.directoryService = directoryService
        self.contactSync = contactSync
        self.userService = userService
        self.conversationCreator = conversationCreator
        self.currentUserId = currentUserId
        self.searchDebounce = searchDebounce
    }

    deinit {
        revalidationTask?.cancel()
        platformSearchTask?.cancel()
    }

    // MARK: - Derived state

    /// Filtrage et recherche appliqués localement : le répertoire est déjà en
    /// mémoire, faire un aller-retour réseau à chaque frappe ferait clignoter
    /// une liste que l'utilisateur voit déjà.
    var visibleContacts: [DirectoryContact] {
        var result = contacts

        switch activeFilter {
        case .all: break
        case .meeshy: result = result.filter(\.isOnMeeshy)
        case .invitable: result = result.filter { !$0.isOnMeeshy }
        }

        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return result }

        return result.filter { contact in
            contact.resolvedName.lowercased().contains(query)
                || contact.matchedUser?.username.lowercased().contains(query) == true
                || contact.emails.contains { $0.contains(query) }
                || contact.phoneNumbers.contains { $0.contains(query) }
        }
    }

    var meeshyCount: Int { contacts.filter(\.isOnMeeshy).count }

    var isEmpty: Bool { contacts.isEmpty }

    /// Requête normalisée. Sous 2 caractères, une recherche plateforme
    /// ramènerait la moitié de l'annuaire — on ne relaie pas.
    private var normalizedQuery: String {
        searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Le relais plateforme ne s'affiche QUE lorsque le répertoire n'a rien
    /// répondu : « cherche parmi mes contacts, et si tu ne trouves pas, sur
    /// Meeshy ». Les résultats plateforme ne s'ajoutent jamais aux contacts,
    /// ils prennent le relais.
    var showsPlatformResults: Bool {
        normalizedQuery.count >= 2 && visibleContacts.isEmpty
    }

    // MARK: - Load

    func load(forceNetwork: Bool = false) async {
        if forceNetwork {
            await refreshFromNetwork()
            await synchronizeIfDirectoryIsEmpty()
            return
        }

        switch await CacheCoordinator.shared.phonebook.load(for: cacheKey) {
        case .fresh(let cached, _):
            contacts = cached
            loadState = .loaded

        case .stale(let cached, _):
            contacts = cached
            loadState = .loaded
            revalidationTask?.cancel()
            revalidationTask = Task { [weak self] in await self?.refreshFromNetwork() }

        case .expired, .empty:
            loadState = contacts.isEmpty ? .loading : .loaded
            await refreshFromNetwork()
        }

        await synchronizeIfDirectoryIsEmpty()
    }

    /// Première ouverture : un répertoire vide n'a rien à montrer. Si l'accès
    /// aux contacts est DÉJÀ accordé, on le remplit sans rien demander — la
    /// permission a été consentie ailleurs (« Retrouver mes contacts »), et
    /// laisser l'onglet vide alors qu'on peut le peupler est une impasse.
    ///
    /// Aucune demande de permission ici : sans autorisation préalable, l'écran
    /// garde son état vide et son bouton de synchronisation explicite.
    private func synchronizeIfDirectoryIsEmpty() async {
        guard contacts.isEmpty, !isSyncing, !hasAttemptedInitialSync else { return }
        hasAttemptedInitialSync = true
        guard contactSync.authorizationStatus() == .authorized else { return }
        await synchronize(silent: true)
    }

    private func refreshFromNetwork() async {
        do {
            // Le répertoire ENTIER, page par page — plus de plafond à 200
            // (directive 2026-08-21, « Répertoire vide » au-delà).
            let all = try await directoryService.listAll(filter: .all, query: nil)
            contacts = all
            loadState = .loaded
            try? await CacheCoordinator.shared.phonebook.save(all, for: cacheKey)
        } catch {
            // Le cache déjà affiché prime : une revalidation ratée ne doit pas
            // effacer un répertoire consultable (dégradation offline).
            loadState = contacts.isEmpty ? .error(String(localized: "contacts.phonebook.load-error", defaultValue: "Impossible de charger le répertoire", bundle: .main)) : .loaded
        }
    }

    // MARK: - Sync

    /// Lit le carnet de l'appareil et le synchronise. `replace` : le serveur
    /// devient le miroir exact de l'appareil, contacts supprimés compris.
    /// - Parameter silent: `true` pour le remplissage automatique de première
    ///   ouverture — l'utilisateur n'a rien demandé, il ne doit pas recevoir de
    ///   toast ni de retour haptique pour un geste qu'il n'a pas fait.
    func synchronize(silent: Bool = false) async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        hasAttemptedInitialSync = true

        do {
            let result = try await contactSync.syncDirectory(mode: .replace)
            await refreshFromNetwork()
            guard !silent else { return }
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(
                String(
                    format: String(localized: "contacts.phonebook.sync-done", defaultValue: "%d contacts synchronises, %d sur Meeshy", bundle: .main),
                    result.syncedCount,
                    result.matchedCount
                )
            )
        } catch let error as ContactSyncError {
            guard !silent else { return }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(error.localizedDescription)
        } catch {
            guard !silent else { return }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(
                String(localized: "contacts.phonebook.sync-error", defaultValue: "Impossible de synchroniser le répertoire", bundle: .main)
            )
        }
    }

    // MARK: - Recherche relayée (répertoire → plateforme)

    /// À appeler quand la requête change. Le répertoire répond en local et
    /// instantanément (`visibleContacts`) ; ce relais ne part sur le réseau que
    /// s'il n'a rien trouvé, après un temps mort pour ne pas tirer une requête
    /// par frappe.
    func searchQueryChanged() async {
        platformSearchTask?.cancel()
        guard showsPlatformResults else {
            platformResults = []
            isSearchingPlatform = false
            return
        }

        let query = normalizedQuery
        let debounce = searchDebounce
        let userService = self.userService
        platformSearchTask = Task { [weak self] in
            try? await Task.sleep(for: debounce)
            guard !Task.isCancelled else { return }
            await self?.runPlatformSearch(query: query, using: userService)
        }
        await platformSearchTask?.value
    }

    private func runPlatformSearch(query: String, using userService: UserServiceProviding) async {
        isSearchingPlatform = true
        defer { isSearchingPlatform = false }
        do {
            let results = try await userService.searchUsers(query: query, limit: 20, offset: 0)
            // La requête a pu changer pendant l'aller-retour : ne pas écraser
            // l'écran avec les résultats d'une frappe périmée.
            guard query == normalizedQuery else { return }
            platformResults = results.filter { $0.id != currentUserId }
        } catch {
            guard query == normalizedQuery else { return }
            platformResults = []
        }
    }

    /// « Lui écrire » depuis un résultat plateforme (hors répertoire).
    func startConversation(withUserId userId: String) async -> Conversation? {
        await conversationCreator.openDirectConversation(with: userId, currentUserId: currentUserId)
    }

    // MARK: - Actions

    /// « Lui écrire » — ouvre (ou crée) la conversation directe avec le compte
    /// Meeshy rapproché. Renvoie `nil` si le contact n'a pas de compte ou si la
    /// création échoue, l'appelant restant maître de la navigation.
    func startConversation(with contact: DirectoryContact) async -> Conversation? {
        guard let user = contact.matchedUser else { return nil }
        return await startConversation(withUserId: user.id)
    }

    /// Efface le répertoire conservé côté serveur (droit au retrait).
    func eraseDirectory() async {
        do {
            _ = try await directoryService.clear()
            contacts = []
            loadState = .loaded
            try? await CacheCoordinator.shared.phonebook.save([], for: cacheKey)
            FeedbackToastManager.shared.showSuccess(
                String(localized: "contacts.phonebook.erased", defaultValue: "Repertoire efface", bundle: .main)
            )
        } catch {
            FeedbackToastManager.shared.showError(
                String(localized: "contacts.phonebook.erase-error", defaultValue: "Impossible d'effacer le répertoire", bundle: .main)
            )
        }
    }

    func setFilter(_ filter: DirectoryFilter) {
        activeFilter = filter
        HapticFeedback.light()
    }

    /// Message d'invitation pour un contact hors plateforme.
    func invitationMessage(for contact: DirectoryContact) -> String {
        let name = contact.resolvedName
        let greeting = name.isEmpty ? "Salut" : "Salut \(name)"
        return "\(greeting) ! Rejoins-moi sur Meeshy : https://meeshy.me/download"
    }
}

// MARK: - Pagination complète du répertoire (2026-08-21)

/// Règle pure : y a-t-il une page de plus ? Le serveur fait foi quand il le
/// dit (`hasMore`) ; sinon une page PLEINE en annonce une autre, une page
/// courte ou vide clôt la lecture.
// `nonisolated` : consommé depuis des contextes async hors acteur (isolation
// MainActor par défaut du module) — un défaut d'argument isolé fait tomber SILGen.
nonisolated enum DirectoryPaging {
    /// Le plafond de page est désormais celui de la ROUTE (#4163) : elle REFUSE
    /// au-delà de 100, là où le service rabotait à 200 en silence. Demander
    /// 200 rendrait un 400.
    static let pageSize = 100
    /// Filet contre un serveur qui répondrait toujours `hasMore` : 500 pages de
    /// 100 = 50 000 contacts, la même borne qu'avant à taille de page moitié.
    ///
    /// Il ne sert plus au cas nominal : une revalidation passe par le DELTA
    /// (`updatedSince`) et ne lit que ce qui a bougé. Ce filet ne couvre plus
    /// que la PREMIÈRE lecture d'un carnet, et l'anomalie d'un serveur qui ne
    /// clôt jamais sa pagination.
    static let maxPages = 500

    static func hasMore(received: Int, pageSize: Int, serverHasMore: Bool?) -> Bool {
        guard received > 0 else { return false }
        if let serverHasMore { return serverHasMore }
        return received >= pageSize
    }

    /// Le filet a servi : la lecture s'arrête sur un plafond, pas sur la fin du
    /// répertoire. Un filet atteint est un incident, jamais une fin normale.
    static func logCapReached(maxPages: Int, read: Int) {
        phonebookPagingLogger.warning(
            "Répertoire tronqué en lecture : plafond de \(maxPages, privacy: .public) pages atteint, \(read, privacy: .public) contacts lus"
        )
    }
}

extension ContactDirectoryServiceProviding {
    /// Le répertoire, par CURSEUR — et par DELTA quand on sait depuis quand.
    ///
    /// La lecture paginait par DÉCALAGE, ce qui repayait un dénombrement
    /// complet à chaque page, et n'avait ni delta ni ETag : chaque
    /// revalidation retéléchargeait le carnet ENTIER (#4163).
    ///
    /// `updatedSince` change la NATURE de l'appel : sans lui c'est une première
    /// lecture, avec lui c'est un rattrapage borné à ce qui a bougé. Le
    /// filigrane vient de l'`appliedAt` que rend une synchronisation — ce que
    /// le serveur vient d'écrire est exactement ce qu'il reste à relire.
    nonisolated func listAll(
        filter: DirectoryFilter,
        query: String?,
        updatedSince: Date? = nil,
        pageSize: Int = DirectoryPaging.pageSize,
        maxPages: Int = DirectoryPaging.maxPages
    ) async throws -> [DirectoryContact] {
        var all: [DirectoryContact] = []
        var cursor: String?
        var reachedTheEnd = false
        for _ in 0..<maxPages {
            let page = try await self.page(
                cursor: cursor, limit: pageSize, filter: filter, query: query, updatedSince: updatedSince
            )
            all += page.data
            guard DirectoryPaging.hasMore(
                received: page.data.count, pageSize: pageSize, serverHasMore: page.pagination?.hasMore
            ), let suivant = page.pagination?.nextCursor else {
                reachedTheEnd = true
                break
            }
            cursor = suivant
        }
        if !reachedTheEnd {
            DirectoryPaging.logCapReached(maxPages: maxPages, read: all.count)
        }
        return all
    }
}
