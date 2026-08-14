import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

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
    @Published var activeFilter: DirectoryFilter = .all
    @Published var searchQuery: String = ""

    private let directoryService: ContactDirectoryServiceProviding
    private let contactSync: ContactSyncProviding
    private let conversationCreator: ConversationCreating
    private let currentUserId: String
    private let cacheKey = "phonebook:all"
    private var revalidationTask: Task<Void, Never>?

    init(
        directoryService: ContactDirectoryServiceProviding = ContactDirectoryService.shared,
        contactSync: ContactSyncProviding = ContactSyncService.shared,
        conversationCreator: ConversationCreating = ConversationCreator(),
        currentUserId: String = AuthManager.shared.currentUser?.id ?? ""
    ) {
        self.directoryService = directoryService
        self.contactSync = contactSync
        self.conversationCreator = conversationCreator
        self.currentUserId = currentUserId
    }

    deinit {
        revalidationTask?.cancel()
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

    // MARK: - Load

    func load(forceNetwork: Bool = false) async {
        if forceNetwork {
            await refreshFromNetwork()
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
    }

    private func refreshFromNetwork() async {
        do {
            let response = try await directoryService.list(
                offset: 0,
                limit: 200,
                filter: .all,
                query: nil
            )
            contacts = response.data
            loadState = .loaded
            try? await CacheCoordinator.shared.phonebook.save(response.data, for: cacheKey)
        } catch {
            // Le cache déjà affiché prime : une revalidation ratée ne doit pas
            // effacer un répertoire consultable (dégradation offline).
            loadState = contacts.isEmpty ? .error(String(localized: "contacts.phonebook.load-error", defaultValue: "Impossible de charger le repertoire", bundle: .main)) : .loaded
        }
    }

    // MARK: - Sync

    /// Lit le carnet de l'appareil et le synchronise. `replace` : le serveur
    /// devient le miroir exact de l'appareil, contacts supprimés compris.
    func synchronize() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        do {
            let result = try await contactSync.syncDirectory(mode: .replace)
            await refreshFromNetwork()
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(
                String(
                    format: String(localized: "contacts.phonebook.sync-done", defaultValue: "%d contacts synchronises, %d sur Meeshy", bundle: .main),
                    result.syncedCount,
                    result.matchedCount
                )
            )
        } catch let error as ContactSyncError {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(error.localizedDescription)
        } catch {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(
                String(localized: "contacts.phonebook.sync-error", defaultValue: "Impossible de synchroniser le repertoire", bundle: .main)
            )
        }
    }

    // MARK: - Actions

    /// « Lui écrire » — ouvre (ou crée) la conversation directe avec le compte
    /// Meeshy rapproché. Renvoie `nil` si le contact n'a pas de compte ou si la
    /// création échoue, l'appelant restant maître de la navigation.
    func startConversation(with contact: DirectoryContact) async -> Conversation? {
        guard let user = contact.matchedUser else { return nil }
        do {
            return try await conversationCreator.createDirectConversation(
                with: user.id,
                currentUserId: currentUserId
            )
        } catch {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(
                String(localized: "contacts.phonebook.open-error", defaultValue: "Impossible d'ouvrir la conversation", bundle: .main)
            )
            return nil
        }
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
                String(localized: "contacts.phonebook.erase-error", defaultValue: "Impossible d'effacer le repertoire", bundle: .main)
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
