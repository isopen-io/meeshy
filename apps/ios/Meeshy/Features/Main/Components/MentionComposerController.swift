import Foundation
import MeeshySDK
import MeeshyUI
import os

// MARK: - MentionComposerController

/// Manages mention autocomplete for any text composer (conversation, story comment, etc.).
/// Context-aware: routes API suggestions to the correct endpoint based on `Context`.
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
        /// serveur n'existe tant que le contenu n'est pas envoyé — donc aucun
        /// appel réseau n'est possible. Les candidats servis viennent
        /// UNIQUEMENT de `localCandidates` (les amis acceptés, cf. site de
        /// montage). `remoteContext` rend `nil` pour ce cas, et
        /// `handleQuery` s'arrête avant de programmer le débounce distant.
        case composerDraft

        /// `nil` ⇒ aucune requête distante possible (cas `.composerDraft`) :
        /// remplace les anciennes propriétés `contextId`/`contextType`, dont
        /// l'exhaustivité aurait exigé une valeur FACTICE pour ce cas.
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

    // MARK: - Private

    private let context: Context
    private let service: MentionServiceProviding
    private let localCandidates: () -> [MentionCandidate]
    private var debounceTask: Task<Void, Never>?

    // 0 = la liste par défaut s'affiche dès la frappe de « @ » (requête vide) :
    // pour un post, le backend renvoie auteur + personnes ayant commenté + contacts ;
    // pour une conversation, les participants. Débounce + cache Redis évitent le spam.
    private static let minQueryLengthForAPI = 0
    private static let debounceMs: UInt64 = 300_000_000

    // MARK: - Init

    public init(
        context: Context,
        localCandidates: @escaping () -> [MentionCandidate] = { [] },
        service: MentionServiceProviding = MentionService.shared
    ) {
        self.context = context
        self.localCandidates = localCandidates
        self.service = service
    }

    // MARK: - Public API

    /// Called on every text change. Parses the trailing `@query` and
    /// updates `suggestions` / `activeQuery` with a 300ms debounce for API calls.
    public func handleQuery(in text: String) {
        guard let query = extractMentionQuery(from: text) else {
            clearSuggestions()
            return
        }
        activeQuery = query

        let locals = localCandidates()
        let filtered = filterLocals(locals, query: query)
        suggestions = filtered

        debounceTask?.cancel()
        guard query.count >= Self.minQueryLengthForAPI,
              let remoteContext = context.remoteContext else { return }

        debounceTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await Task.sleep(nanoseconds: Self.debounceMs)
                guard !Task.isCancelled else { return }
                let apiResults = try await service.suggestions(
                    contextId: remoteContext.contextId,
                    contextType: remoteContext.contextType,
                    query: query
                )
                guard !Task.isCancelled else { return }
                suggestions = mergeAPISuggestions(apiResults, localCandidates: filtered)
            } catch is CancellationError {
                // Expected — ignore
            } catch {
                Logger.messages.error("MentionComposerController: API suggestions failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Clears active suggestion state (called when `@` is no longer present in text).
    public func clearSuggestions() {
        debounceTask?.cancel()
        debounceTask = nil
        activeQuery = nil
        suggestions = []
    }

    /// Replaces the trailing `@query` in `text` with `@username ` and records the mention.
    /// Returns the updated text.
    @discardableResult
    public func insertMention(_ candidate: MentionCandidate, into text: String) -> String {
        let result = replaceMentionQuery(withUsername: candidate.username, in: text)
        draftMentions[candidate.username] = candidate
        clearSuggestions()
        return result
    }

    /// Clears all draft mention tracking (call after a successful send).
    public func clearDraft() {
        draftMentions = [:]
    }

    // MARK: - Private Helpers

    /// Extracts the current `@query` fragment at the end of the text cursor.
    /// Returns `nil` when no active mention is in progress.
    ///
    /// Délégué à la règle PURE du SDK (`ComposerMentionQuery`), partagée avec
    /// les composeurs de post et de story : la règle vivait ici en double, et
    /// cette copie-ci ouvrait une recherche sur « exemple.com » à chaque
    /// `contact@exemple.com` tapé — elle coupait sur le DERNIER `@` sans
    /// vérifier qu'il ouvre un handle.
    private func extractMentionQuery(from text: String) -> String? {
        ComposerMentionQuery.trailingHandle(in: text)
    }

    private func filterLocals(_ locals: [MentionCandidate], query: String) -> [MentionCandidate] {
        guard !query.isEmpty else { return locals }
        return locals.filter {
            $0.username.localizedCaseInsensitiveContains(query) ||
            $0.displayName.localizedCaseInsensitiveContains(query)
        }
    }

    /// Merges API `[MentionSuggestion]` into `[MentionCandidate]`, deduplicating against
    /// already-present local candidates (by username). API results come first.
    private func mergeAPISuggestions(
        _ api: [MentionSuggestion],
        localCandidates: [MentionCandidate]
    ) -> [MentionCandidate] {
        let localUsernames = Set(localCandidates.map(\.username))
        let fromAPI = api.map { s in
            MentionCandidate(
                id: s.id,
                username: s.username,
                displayName: s.displayName ?? s.username,
                avatarURL: s.avatar
            )
        }
        let newFromAPI = fromAPI.filter { !localUsernames.contains($0.username) }
        return localCandidates + newFromAPI
    }

    /// Replaces the active `@query` fragment at the end of the text with the
    /// chosen handle. Même règle partagée que l'extraction — deux moitiés d'une
    /// même décision ne peuvent pas vivre à deux endroits différents.
    private func replaceMentionQuery(withUsername username: String, in text: String) -> String {
        ComposerMentionQuery.replacingTrailingHandle(in: text, with: username)
    }
}
