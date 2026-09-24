import Foundation
import MeeshySDK
import MeeshyUI
import os

// MARK: - MentionComposerController

/// Manages mention autocomplete for any text composer (conversation, comments,
/// story comments, composer draft…).
///
/// **La règle du porteur (#7847, 2026-09-24)**, appliquée à la lettre :
///
/// | frappe | ce qui répond | réseau |
/// |---|---|---|
/// | `@` | contacts (cache) puis participants du contexte | aucun — le cache des contacts se réchauffe s'il est vide ou périmé |
/// | `@a` | les mêmes, filtrés localement | aucun |
/// | `@al` | les mêmes filtrés, puis les AUTRES trouvés au réseau | une recherche |
/// | `@ali…` | affinage local instantané, puis recherche relancée (débounce) | les autres déjà connus restent affichés |
///
/// L'ÉTAPE est `MentionLookupRule.stage(for:)` et l'ORDRE (contacts →
/// participants → autres, sans doublon, jamais soi) est `MentionSuggestionRule`
/// — deux règles pures du SDK, partagées avec `MentionSuggestionsModel`.
/// L'orchestration du cache des contacts est `MentionContactsStore` (app).
@MainActor
public final class MentionComposerController: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    // MARK: - Context

    public enum Context: Equatable, Sendable {
        case conversation(id: String)
        case post(id: String)

        /// **Un brouillon composer PAS ENCORE publié (#3904).** Aucun id
        /// serveur n'existe tant que le contenu n'est pas envoyé — l'endpoint
        /// CONTEXTUEL est donc impossible, et la recherche distante passe par
        /// l'ANNUAIRE (`AudienceUserSearching`).
        case composerDraft

        /// `nil` ⇒ aucune requête CONTEXTUELLE possible (cas `.composerDraft`).
        var remoteContext: (contextId: String, contextType: MentionContextType)? {
            switch self {
            case .conversation(let id): return (id, .conversation)
            case .post(let id): return (id, .post)
            case .composerDraft: return nil
            }
        }
    }

    // MARK: - Published State

    @Published public private(set) var suggestions: [MentionCandidate] = []
    @Published public private(set) var activeQuery: String? = nil
    @Published public private(set) var draftMentions: [String: MentionCandidate] = [:]

    /// **Une recherche est EN VOL.** Sans ce témoin, « aucune suggestion »
    /// couvre deux états qui n'ont pas la même réponse : « personne ne
    /// correspond » et « on n'a pas encore regardé ». Une bande qui les
    /// confond annonce « aucune personne trouvée » 300 ms avant d'avoir
    /// cherché, puis se dédit.
    @Published public private(set) var isResolving = false

    /// **LA règle de montage de la bande, écrite UNE fois.**
    ///
    /// On montre la bande dès qu'une requête `@` est active, SAUF pendant
    /// qu'une recherche est en vol et n'a encore rien rendu. Une bande vide
    /// n'est donc pas un silence : c'est la réponse « personne », que
    /// `ComposerMentionStrip` écrit en toutes lettres.
    public var showsSuggestions: Bool {
        activeQuery != nil && (!suggestions.isEmpty || !isResolving)
    }

    // MARK: - Private

    private var context: Context
    private let service: MentionServiceProviding
    private let directory: AudienceUserSearching
    private let contacts: MentionContactsProviding
    private let currentUserId: String?
    private let debounceNanoseconds: UInt64
    private var participants: () -> [MentionCandidate]
    /// Les « autres » rendus par la DERNIÈRE recherche distante. Ils restent
    /// affichés, refiltrés par la requête courante, pendant que la suivante
    /// est en vol — c'est ce qui affine sans clignoter.
    private var others: [MentionCandidate] = []
    private var debounceTask: Task<Void, Never>?
    private var warmTask: Task<Void, Never>?

    public static let defaultDebounceNanoseconds: UInt64 = 300_000_000
    /// Même plafond que `MentionSuggestionsModel` (SDK), qui interroge le même
    /// annuaire : deux plafonds différents pour une même liste se seraient
    /// contredits à l'écran selon la surface qui pose la question.
    private static let directoryLimit = 20

    // MARK: - Init

    /// `participants` : les personnes du CONTEXTE (expéditeurs d'une
    /// conversation, auteur et commentateurs d'un post), servies APRÈS les
    /// contacts. `contacts` : le magasin des contacts, lu depuis le cache et
    /// réchauffé à la frappe du `@`.
    init(
        context: Context,
        participants: @escaping () -> [MentionCandidate] = { [] },
        service: MentionServiceProviding = MentionService.shared,
        directory: AudienceUserSearching = UserService.shared,
        contacts: MentionContactsProviding = MentionContactsStore.shared,
        currentUserId: String? = AuthManager.shared.currentUser?.id,
        debounceNanoseconds: UInt64 = MentionComposerController.defaultDebounceNanoseconds
    ) {
        self.context = context
        self.participants = participants
        self.service = service
        self.directory = directory
        self.contacts = contacts
        self.currentUserId = currentUserId
        self.debounceNanoseconds = debounceNanoseconds
    }

    // MARK: - Public API

    /// Charge les contacts EN CACHE (sans réseau) avant la première frappe,
    /// pour que le `@` les serve à l'image près. À appeler au montage de l'hôte.
    public func primeContacts() async {
        _ = await contacts.loadCached()
        recompute()
    }

    /// Remplace les participants du contexte (auteur et commentateurs d'un
    /// post, dont la liste bouge). Une liste ouverte se recompose aussitôt.
    public func updateParticipants(_ list: [MentionCandidate]) {
        participants = { list }
        recompute()
    }

    /// Change le contexte distant d'un hôte qui SURVIT à son sujet (la barre
    /// du lecteur de story passe d'une story à la suivante sans se démonter).
    /// Une liste ouverte sur l'ancien contexte se referme.
    public func retarget(_ newContext: Context) {
        guard newContext != context else { return }
        context = newContext
        clearSuggestions()
    }

    /// La frappe d'un hôte dont les participants BOUGENT (commentaires d'un
    /// post) : la liste du contexte est relue à chaque frappe, jamais figée à
    /// la construction.
    public func handleQuery(in text: String, participants list: [MentionCandidate]) {
        participants = { list }
        handleQuery(in: text)
    }

    /// Appelée à chaque changement de texte.
    public func handleQuery(in text: String) {
        guard let query = ComposerMentionQuery.trailingHandle(in: text) else {
            clearSuggestions()
            return
        }
        let opening = activeQuery == nil
        activeQuery = query
        debounceTask?.cancel()

        let stage = MentionLookupRule.stage(for: query)
        if stage != .remote { others = [] }
        recompute()
        if opening { warmContacts() }

        guard stage == .remote else {
            isResolving = false
            return
        }
        scheduleRemoteLookup(query: query.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Clears active suggestion state (called when `@` is no longer present in text).
    public func clearSuggestions() {
        debounceTask?.cancel()
        debounceTask = nil
        warmTask?.cancel()
        warmTask = nil
        others = []
        activeQuery = nil
        suggestions = []
        isResolving = false
    }

    /// Replaces the trailing `@query` in `text` with `@username ` and records the mention.
    /// Returns the updated text.
    @discardableResult
    public func insertMention(_ candidate: MentionCandidate, into text: String) -> String {
        let result = ComposerMentionQuery.replacingTrailingHandle(in: text, with: candidate.username)
        draftMentions[candidate.username] = candidate
        clearSuggestions()
        return result
    }

    /// Clears all draft mention tracking (call after a successful send).
    public func clearDraft() {
        draftMentions = [:]
    }

    // MARK: - Private Helpers

    /// **Le `@` réchauffe le cache des contacts** s'il est vide ou périmé :
    /// ce qu'il sert d'abord est la mémoire ou le disque ; le réseau ne vient
    /// qu'ensuite, et un échec n'efface rien de ce qui est affiché.
    private func warmContacts() {
        warmTask?.cancel()
        warmTask = Task { [weak self] in
            guard let self else { return }
            if self.contacts.snapshot.isEmpty {
                _ = await self.contacts.loadCached()
                guard !Task.isCancelled else { return }
                self.recompute()
            }
            _ = await self.contacts.refreshIfNeeded()
            guard !Task.isCancelled else { return }
            self.recompute()
        }
    }

    /// **Une seule recherche distante, deux sources selon le contexte.** Une
    /// conversation ou un post interrogent `/mentions/suggestions` ; un
    /// brouillon, sans id serveur, interroge l'annuaire (#3904 → 2026-09-05).
    private func scheduleRemoteLookup(query: String) {
        isResolving = true
        let debounce = debounceNanoseconds
        debounceTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await Task.sleep(nanoseconds: debounce)
                guard !Task.isCancelled else { return }
                let found = try await self.remoteCandidates(for: query)
                guard !Task.isCancelled else { return }
                self.others = found
                self.recompute()
                self.isResolving = false
            } catch is CancellationError {
                // Attendu : une frappe plus récente a déjà repris le témoin à
                // son compte — le remettre à `false` ici l'éteindrait pour la
                // recherche SUIVANTE, qui vient de commencer.
            } catch {
                guard !Task.isCancelled else { return }
                self.isResolving = false
                Logger.messages.error("MentionComposerController: remote suggestions failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    private func remoteCandidates(for query: String) async throws -> [MentionCandidate] {
        guard let remote = context.remoteContext else {
            let found = try await directory.searchUsers(query: query, limit: Self.directoryLimit, offset: 0)
            return found.map {
                MentionCandidate(id: $0.id, username: $0.username,
                                 displayName: $0.displayName ?? $0.username, avatarURL: $0.avatar)
            }
        }
        let found = try await service.suggestions(
            contextId: remote.contextId, contextType: remote.contextType, query: query)
        return found.map {
            MentionCandidate(id: $0.id, username: $0.username,
                             displayName: $0.displayName ?? $0.username, avatarURL: $0.avatar)
        }
    }

    private func recompute() {
        guard let query = activeQuery else { return }
        suggestions = MentionSuggestionRule.ordered(
            contacts: contacts.snapshot,
            participants: participants(),
            others: others,
            query: query,
            excludingUserId: currentUserId
        )
    }
}
