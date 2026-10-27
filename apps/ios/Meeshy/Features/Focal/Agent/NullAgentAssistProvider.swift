import Foundation

/// LE provider de cette branche — SEUL et UNIQUE (contrat §3.8, §WS-10).
/// Renvoie systématiquement du vide : `nil`/`[]`/`[:]`, jamais une donnée
/// fabriquée. C'est le plancher C1 appliqué aux surfaces agent : tant que
/// `assist:*` n'existe pas côté serveur (§0, écart #10 — « zéro occurrence
/// dans le dépôt »), toute surface agent qui en dépend reste du code MORT
/// ET ASSUMÉ, jamais un faux-semblant.
nonisolated public final class NullAgentAssistProvider: AgentAssistProviding, @unchecked Sendable {
    public init() {}

    public func bridge(for conversationId: String) async -> AgentBridgeLine? { nil }

    public func suggestions(for conversationId: String, anchoredTo messageId: String) async -> [AgentSuggestion] { [] }

    public func shortcuts(for conversationId: String, anchoredTo messageId: String) async -> [AgentShortcut] { [] }

    public func episodeTitles(for conversationId: String, episodes: [ConversationEpisode]) async -> [String: String] { [:] }
}
