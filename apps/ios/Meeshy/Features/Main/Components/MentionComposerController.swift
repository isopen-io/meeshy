import Foundation
import MeeshySDK
import os

// MARK: - MentionComposerController

/// Manages mention autocomplete for any text composer (conversation, story comment, etc.).
/// Context-aware: routes API suggestions to the correct endpoint based on `Context`.
@MainActor
public final class MentionComposerController: ObservableObject {

    // MARK: - Context

    public enum Context: Equatable, Sendable {
        case conversation(id: String)
        case post(id: String)

        var contextId: String {
            switch self {
            case .conversation(let id): return id
            case .post(let id): return id
            }
        }

        var contextType: MentionContextType {
            switch self {
            case .conversation: return .conversation
            case .post: return .post
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
        guard query.count >= Self.minQueryLengthForAPI else { return }

        debounceTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await Task.sleep(nanoseconds: Self.debounceMs)
                guard !Task.isCancelled else { return }
                let apiResults = try await service.suggestions(
                    contextId: context.contextId,
                    contextType: context.contextType,
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
        let result = replaceMentionQuery(with: "@\(candidate.username) ", in: text)
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
    private func extractMentionQuery(from text: String) -> String? {
        let components = text.components(separatedBy: "@")
        guard components.count > 1 else { return nil }
        let last = components.last ?? ""
        // Only consider active if the last component has no spaces (still typing username)
        guard !last.contains(" ") else { return nil }
        return last
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

    /// Replaces the active `@query` fragment at the end of the text with `replacement`.
    private func replaceMentionQuery(with replacement: String, in text: String) -> String {
        guard let lastAt = text.lastIndex(of: "@") else { return text }
        let afterAt = text[text.index(after: lastAt)...]
        guard !afterAt.contains(" ") else { return text }
        return String(text[text.startIndex..<lastAt]) + replacement
    }
}
