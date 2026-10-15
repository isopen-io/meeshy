import Foundation
import MeeshySDK
import os

// MARK: - Ce que la passe lit

/// Une ligne de la liste, réduite à ce que le préchargement en lit.
nonisolated struct ConversationPrefetchCandidate: Equatable, Sendable {
    let conversationId: String
    let lastMessageId: String?
    let lastMessageAt: Date

    /// Le dernier message que la LIGNE annonce — ce qu'une passe réussie a
    /// déjà rapporté, et qu'elle n'a donc plus à redemander.
    var latestMark: String { lastMessageId ?? "@\(lastMessageAt.timeIntervalSince1970)" }
}

/// Ce que la base locale (GRDB, la table que le fil PEINT) détient déjà d'une
/// conversation : sa fenêtre la plus récente.
nonisolated struct HeldMessageWindow: Equatable, Sendable {
    let count: Int
    let serverIds: Set<String>
    let newestServerCreatedAt: Date?

    static let empty = HeldMessageWindow(count: 0, serverIds: [], newestServerCreatedAt: nil)

    init(count: Int, serverIds: Set<String>, newestServerCreatedAt: Date?) {
        self.count = count
        self.serverIds = serverIds
        self.newestServerCreatedAt = newestServerCreatedAt
    }

    /// Une ligne optimiste (sans `serverId`) porte l'horloge de l'APPAREIL :
    /// elle compte dans la fenêtre, jamais dans l'instant le plus récent.
    init(records: [MessageRecord]) {
        let served = records.filter { $0.serverId != nil }
        self.init(
            count: records.count,
            serverIds: Set(served.compactMap(\.serverId)),
            newestServerCreatedAt: served.map(\.createdAt).max()
        )
    }

    /// La fenêtre contient-elle le dernier message que la ligne annonce ?
    func holdsLatest(of candidate: ConversationPrefetchCandidate) -> Bool {
        if let id = candidate.lastMessageId, serverIds.contains(id) { return true }
        guard let newest = newestServerCreatedAt else { return false }
        return newest >= candidate.lastMessageAt
    }
}

/// Le compte pour lequel une passe précharge.
nonisolated struct ConversationPrefetchOwner: Equatable, Sendable {
    let userId: String
    let username: String?
}

/// Une demande de passe : les lignes à servir, le compte qui la lance, et la
/// question qu'elle repose avant chaque requête et chaque écriture (#8651).
nonisolated struct ConversationListPrefetchRequest: Sendable {
    let candidates: [ConversationPrefetchCandidate]
    let owner: ConversationPrefetchOwner
    let stillOwner: @MainActor @Sendable () -> Bool
}

// MARK: - La base locale vue par le préchargement

/// Ce que le préchargement lit et grave dans la base locale d'UN compte.
nonisolated protocol ConversationListPrefetchStoreProviding: Sendable {
    /// La fenêtre la plus récente détenue — `nil` quand la base de `ownerId`
    /// n'est plus la base active (rien à lire, rien à écrire pour lui).
    @concurrent func heldWindow(conversationId: String, ownerId: String, limit: Int) async -> HeldMessageWindow?
    /// Grave la page servie là où le fil la PEINT — `false` si rien n'a été écrit.
    @concurrent func persist(_ page: [APIMessage], conversationId: String, owner: ConversationPrefetchOwner) async -> Bool
}

/// La table `messages` de GRDB, celle que `ConversationViewModel.loadMessages`
/// peint avant tout réseau — et le cache hérité, que l'aperçu de la ligne lit
/// encore (`loadPreviewMessages`).
///
/// Avant #10572 la page préchargée n'allait QUE dans `CacheCoordinator.messages`,
/// que le fil ne lit pas : une conversation « préchargée » s'ouvrait froide,
/// squelette et attente réseau compris.
nonisolated struct ConversationListPrefetchStore: ConversationListPrefetchStoreProviding {
    private let persistenceOwnedBy: @Sendable @concurrent (String) async -> MessagePersistenceActor?
    private let readerPrism: @Sendable @concurrent () async -> [String]

    init(
        persistenceOwnedBy: @escaping @Sendable @concurrent (String) async -> MessagePersistenceActor? = { ownerId in
            await ConversationListPrefetchStore.activeAccountPersistence(ownedBy: ownerId)
        },
        readerPrism: @escaping @Sendable @concurrent () async -> [String] = {
            await MessagePersistenceActor.readerPrism()
        }
    ) {
        self.persistenceOwnedBy = persistenceOwnedBy
        self.readerPrism = readerPrism
    }

    /// La base du compte `ownerId` si c'est encore la base ACTIVE (#8656) —
    /// une page demandée sous un compte ne s'écrit jamais dans celle du suivant.
    static func activeAccountPersistence(ownedBy ownerId: String) async -> MessagePersistenceActor? {
        let router = await MainActor.run { DependencyContainer.shared.storeRouter }
        return router.session(ownedBy: ownerId)?.messagePersistence
    }

    @concurrent
    func heldWindow(conversationId: String, ownerId: String, limit: Int) async -> HeldMessageWindow? {
        guard let persistence = await persistenceOwnedBy(ownerId) else { return nil }
        let records = (try? persistence.messages(for: conversationId, limit: limit)) ?? []
        return HeldMessageWindow(records: records)
    }

    /// Le prisme gravé est celui du FIL (`ReaderPrism`, #4945) : une citation
    /// préchargée ne se grave pas sous un autre texte que celle que la
    /// revalidation de l'ouverture graverait.
    @concurrent
    func persist(_ page: [APIMessage], conversationId: String, owner: ConversationPrefetchOwner) async -> Bool {
        guard let persistence = await persistenceOwnedBy(owner.userId) else { return false }
        let prism = await readerPrism()
        do {
            try await persistence.upsertFromAPIMessages(page, preferredLanguages: prism)
        } catch {
            Logger.messages.warning("[ConversationList] prefetch persist failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return false
        }
        let fresh = page.map {
            $0.toMessage(currentUserId: owner.userId, currentUsername: owner.username, preferredLanguages: prism)
        }
        await CacheCoordinator.shared.messages.mergeUpdate(for: conversationId) { existing in
            let freshIds = Set(fresh.map(\.id))
            return (fresh + existing.filter { !freshIds.contains($0.id) }).sorted { $0.createdAt < $1.createdAt }
        }
        return true
    }
}

// MARK: - Le préchargement

/// **Le préchargement des messages des premières conversations de la liste.**
///
/// Extrait de `ConversationListViewModel` (#8651, fichier hors budget).
///
/// #10572 — ouvrir une des premières conversations de la liste ne doit jamais
/// attendre le réseau pour montrer ses derniers messages. D'où trois règles :
/// - la page est gravée dans GRDB, la table que le fil peint (`persist`) ;
/// - une conversation n'est sautée que si GRDB détient DÉJÀ son dernier
///   message ET de quoi remplir un écran — ou si une passe RÉUSSIE de ce
///   processus l'a déjà rapportée sur ce même dernier message (une
///   conversation plus courte qu'un écran). Une entrée de cache hérité créée
///   par un seul message socket ne suffit plus à la condamner pour six mois ;
/// - la passe se rejoue au chargement, au retour au premier plan et à la
///   reconnexion, UNE à la fois : une demande qui arrive pendant une passe la
///   suit, et la plus récente remplace celle qui attendait.
///
/// La passe est DÉTACHÉE et chaque requête part sous le jeton COURANT
/// d'`APIClient`. Incident de production du 2026-09-29 : juste après un
/// changement de compte, ~30 `GET /conversations/:id/messages` → 404 — les
/// conversations du compte QUITTÉ, demandées sous le compte suivant. Elle ne
/// demande donc rien, et n'écrit rien, dès que `stillOwner()` dit que le compte
/// qui l'a lancée n'est plus le compte actif — ni pour un identifiant vide.
@MainActor
final class ConversationListMessagePrefetcher {

    nonisolated static let maxConversations = 20
    /// La page de la revalidation d'ouverture (`refreshMessagesFromAPI`).
    nonisolated static let pageLimit = 30
    /// Un écran plein de bulles, avec de la marge : en deçà, le fil peindrait
    /// le dernier message seul puis verrait arriver le reste au-dessus.
    nonisolated static let minimumHeldWindow = 20
    nonisolated static let maxConcurrentFetches = 4

    private let messageService: any MessageServiceProviding
    private let store: any ConversationListPrefetchStoreProviding
    private var inFlight: Task<Void, Never>?
    private var pending: ConversationListPrefetchRequest?
    /// Compte + conversation → dernier message rapporté par une passe RÉUSSIE.
    /// Un échec n'y entre pas : la passe suivante le retente.
    private var prefetchedMarks: [String: String] = [:]
    private var armedForNextReload = false

    nonisolated deinit {}

    init(
        messageService: any MessageServiceProviding = MessageService.shared,
        store: any ConversationListPrefetchStoreProviding = ConversationListPrefetchStore()
    ) {
        self.messageService = messageService
        self.store = store
    }

    /// Les lignes à précharger : les premières à identifiant NON VIDE, dans l'ordre.
    nonisolated static func targets(_ conversations: [Conversation]) -> [ConversationPrefetchCandidate] {
        conversations
            .filter { !$0.id.isEmpty }
            .prefix(maxConversations)
            .map {
                ConversationPrefetchCandidate(
                    conversationId: $0.id, lastMessageId: $0.lastMessageId, lastMessageAt: $0.lastMessageAt
                )
            }
    }

    nonisolated static func needsPrefetch(
        _ candidate: ConversationPrefetchCandidate,
        held: HeldMessageWindow,
        prefetchedMark: String?
    ) -> Bool {
        guard prefetchedMark != candidate.latestMark else { return false }
        return !(held.holdsLatest(of: candidate) && held.count >= minimumHeldWindow)
    }

    nonisolated static func ledgerKey(ownerId: String, conversationId: String) -> String {
        "\(ownerId)|\(conversationId)"
    }

    func schedule(_ request: ConversationListPrefetchRequest) {
        guard inFlight == nil else {
            pending = request
            return
        }
        run(request)
    }

    /// La reconnexion rejoue la passe tout de suite (ce qui a échoué hors
    /// ligne) PUIS au rechargement de liste qui suit son delta — c'est lui qui
    /// apporte les derniers messages arrivés pendant la coupure.
    func armForNextReload() {
        armedForNextReload = true
    }

    func takeReloadArm() -> Bool {
        defer { armedForNextReload = false }
        return armedForNextReload
    }

    func waitUntilIdle() async {
        while let task = inFlight { await task.value }
    }

    private func run(_ request: ConversationListPrefetchRequest) {
        let marks = self.prefetchedMarks
        let messageService = self.messageService
        let store = self.store
        inFlight = Task.detached(priority: .utility) { [weak self] in
            let completed = await ConversationListMessagePrefetcher.pass(
                request, prefetchedMarks: marks, messageService: messageService, store: store
            )
            await self?.finish(recording: completed)
        }
    }

    private func finish(recording completed: [String: String]) {
        prefetchedMarks.merge(completed) { _, latest in latest }
        inFlight = nil
        guard let next = pending else { return }
        pending = nil
        run(next)
    }

    @concurrent
    nonisolated static func pass(
        _ request: ConversationListPrefetchRequest,
        prefetchedMarks: [String: String],
        messageService: any MessageServiceProviding,
        store: any ConversationListPrefetchStoreProviding
    ) async -> [String: String] {
        var completed: [String: String] = [:]
        let candidates = request.candidates
        for start in stride(from: 0, to: candidates.count, by: maxConcurrentFetches) {
            guard await request.stillOwner() else { break }
            let batch = candidates[start..<min(start + maxConcurrentFetches, candidates.count)]
            let marks = await withTaskGroup(of: (String, String)?.self, returning: [(String, String)].self) { group in
                for candidate in batch {
                    let key = ConversationListMessagePrefetcher.ledgerKey(
                        ownerId: request.owner.userId, conversationId: candidate.conversationId
                    )
                    let known = prefetchedMarks[key]
                    group.addTask {
                        let mark = await ConversationListMessagePrefetcher.prefetch(
                            candidate, request: request, prefetchedMark: known,
                            messageService: messageService, store: store
                        )
                        return mark.map { (key, $0) }
                    }
                }
                var done: [(String, String)] = []
                for await mark in group {
                    if let mark { done.append(mark) }
                }
                return done
            }
            for (key, mark) in marks { completed[key] = mark }
        }
        return completed
    }

    /// Rend le dernier message rapporté quand la page est GRAVÉE, `nil` sinon
    /// (sautée, compte quitté, réseau ou écriture en échec).
    @concurrent
    nonisolated static func prefetch(
        _ candidate: ConversationPrefetchCandidate,
        request: ConversationListPrefetchRequest,
        prefetchedMark: String?,
        messageService: any MessageServiceProviding,
        store: any ConversationListPrefetchStoreProviding
    ) async -> String? {
        guard await request.stillOwner(),
              let held = await store.heldWindow(
                  conversationId: candidate.conversationId, ownerId: request.owner.userId, limit: pageLimit
              ),
              needsPrefetch(candidate, held: held, prefetchedMark: prefetchedMark)
        else { return nil }
        do {
            let response = try await messageService.list(
                conversationId: candidate.conversationId,
                offset: 0,
                limit: pageLimit,
                includeReplies: true,
                includeTranslations: true
            )
            guard response.success, await request.stillOwner() else { return nil }
            let persisted = await store.persist(response.data, conversationId: candidate.conversationId, owner: request.owner)
            return persisted ? candidate.latestMark : nil
        } catch {
            Logger.messages.warning("[ConversationList] prefetch failed for \(candidate.conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
