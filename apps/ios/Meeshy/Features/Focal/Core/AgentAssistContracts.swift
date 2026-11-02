import Foundation

/// Surfaces agent ✦ — contrat Focal §3.8, prescrit mot pour mot.
///
/// **RE-PREUVE (§0, avant écriture)** : ce fichier N'EXISTAIT PAS. Même
/// constat que `FocalMetrics.swift`/`FocalRowInput.swift`/
/// `LivingSummaryModels.swift` — l'arborescence §1.1 le place sous
/// `Focal/Core/` (propriété WS-0), mais le Core gelé S1 livré ne porte QUE
/// `ReadingModeOrchestrator`/`FocalFocusCurve`/`ScrollTimePillLaw`. AJOUT,
/// jamais une édition d'un fichier gelé — créé ici (WS-10/F-089, premier et
/// seul consommateur) au domicile canonique du contrat.
///
/// **Ce qui existe vraiment vs ce qui n'existe pas** (contrat §WS-10) :
/// `Message.messageSource` est peuplé de bout en bout — c'est le SEUL signal
/// agent réellement disponible. `assist:suggestion`, `assist:summary-patch`,
/// `assist:actions`, `assist:episode`, `POST /conversations/:id/agents`, le
/// rôle `observer` : ZÉRO occurrence dans le dépôt. `NullAgentAssistProvider`
/// (`Focal/Agent/NullAgentAssistProvider.swift`) est donc le SEUL provider de
/// cette branche — chaque méthode ci-dessous rend systématiquement du vide.
nonisolated public struct AgentBridgeLine: Equatable, Sendable {
    public let text: String
    /// Non vide, sinon rejetée (contrat §6.3, interdit 2).
    public let evidenceMessageIds: [String]

    /// `nil` si `evidenceMessageIds` est vide — même garde que `AwaitingItem`
    /// (WS-8) : une ligne sans preuve n'est pas produite, jamais filtrée à
    /// l'affichage.
    public init?(text: String, evidenceMessageIds: [String]) {
        guard !evidenceMessageIds.isEmpty else { return nil }
        self.text = text
        self.evidenceMessageIds = evidenceMessageIds
    }
}

nonisolated public struct AgentSuggestion: Equatable, Sendable, Identifiable {
    public let id: String
    public let text: String
    public let targetMessageId: String?
    public let actionKey: String?

    public init(id: String, text: String, targetMessageId: String?, actionKey: String?) {
        self.id = id
        self.text = text
        self.targetMessageId = targetMessageId
        self.actionKey = actionKey
    }
}

nonisolated public struct AgentShortcut: Equatable, Sendable, Identifiable {
    public let id: String
    public let titleKey: String
    public let systemGlyph: String
    public let payload: String

    public init(id: String, titleKey: String, systemGlyph: String, payload: String) {
        self.id = id
        self.titleKey = titleKey
        self.systemGlyph = systemGlyph
        self.payload = payload
    }
}

public protocol AgentAssistProviding: AnyObject {
    func bridge(for conversationId: String) async -> AgentBridgeLine?
    func suggestions(for conversationId: String, anchoredTo messageId: String) async -> [AgentSuggestion]
    func shortcuts(for conversationId: String, anchoredTo messageId: String) async -> [AgentShortcut]
    func episodeTitles(for conversationId: String, episodes: [ConversationEpisode]) async -> [String: String]
}
