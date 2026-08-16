import Foundation

/// Contrôleur observable du mode de lecture d'UNE conversation ouverte —
/// contrat `focal-implementation-contract.md` §WS-1. Enveloppe la loi gelée
/// `ReadingModeOrchestrator.resolveOrchestratorDecision` (`Focal/Core/`,
/// M-042) + le stockage local scopé (`ReadingModePreferenceStore`, ce
/// dossier). WS-7 (lot ultérieur, `ConversationView.init`) instancie et
/// possède ce contrôleur pour la durée de vie de l'écran ; F-080 livre la
/// coquille testable seule — la construction n'est PAS appelée depuis
/// `ConversationView` dans cette tâche (hors périmètre WS-1, propriété WS-7
/// §1.2).
///
/// **Écart assumé vs contrat §3.5** : `decision` y est typée
/// `ReadingModeDecision` (mode + source + `showsBridge` + `anchorMessageId`
/// + `reasonKey`) — un type qui n'existe nulle part dans le Core gelé
/// (RE-PREUVE F-080). `showsBridge`/`anchorMessageId` dépendent du pont ✦ et
/// du premier message non lu, deux calculs que WS-1 ne possède pas (bridge :
/// LWS-2bis/Lentille ; ancre : WS-6/WS-7). Ce contrôleur expose donc
/// `decision: ReadingModeOrchestrator.OrchestratorDecision` (mode + reason),
/// le type RÉEL que la loi gelée produit — moins riche que le contrat, mais
/// honnête : rien n'est inventé pour combler ce que la loi ne rend pas.
@MainActor
final class ReadingModeController: ObservableObject {

    @Published private(set) var mode: ConversationReadingMode
    @Published private(set) var decision: ReadingModeOrchestrator.OrchestratorDecision

    private let conversationId: String
    private let scope: ReadingModePreferenceScope
    private let unreadCount: Int
    private let capabilities: ReadingModeOrchestrator.ReadingModeCapabilities
    private let isFlagEnabled: Bool
    private let store: FocalReadingModePreferenceStoring
    private let now: () -> Date

    init(
        conversationId: String,
        scope: ReadingModePreferenceScope,
        unreadCount: Int,
        capabilities: ReadingModeOrchestrator.ReadingModeCapabilities,
        isFlagEnabled: Bool,
        store: FocalReadingModePreferenceStoring = ReadingModePreferenceStore(),
        now: @escaping () -> Date = Date.init
    ) {
        self.conversationId = conversationId
        self.scope = scope
        self.unreadCount = unreadCount
        self.capabilities = capabilities
        self.isFlagEnabled = isFlagEnabled
        self.store = store
        self.now = now

        let sticky = store.mode(for: conversationId, scope: scope)
        let resolved = Self.decide(
            stickyMode: sticky,
            unreadCount: unreadCount,
            lastOpenedAt: store.lastOpenedAt(for: conversationId, scope: scope),
            now: now(),
            capabilities: capabilities,
            isFlagEnabled: isFlagEnabled
        )
        self.decision = resolved
        self.mode = resolved.mode
    }

    /// Fige un choix manuel — préférence collante (§WS-1 « préférence
    /// collante par conversation »).
    func select(_ mode: ConversationReadingMode) {
        store.setMode(mode, for: conversationId, scope: scope)
        recompute()
    }

    /// « Revenir en mode auto » — efface la clé, rend la main à
    /// l'orchestrateur (§WS-1 « revenir en mode auto disponible »).
    func resetToAuto() {
        store.setMode(nil, for: conversationId, scope: scope)
        recompute()
    }

    private func recompute() {
        let sticky = store.mode(for: conversationId, scope: scope)
        let resolved = Self.decide(
            stickyMode: sticky,
            unreadCount: unreadCount,
            lastOpenedAt: store.lastOpenedAt(for: conversationId, scope: scope),
            now: now(),
            capabilities: capabilities,
            isFlagEnabled: isFlagEnabled
        )
        decision = resolved
        mode = resolved.mode
    }

    private static func decide(
        stickyMode: ConversationReadingMode?,
        unreadCount: Int,
        lastOpenedAt: Date?,
        now: Date,
        capabilities: ReadingModeOrchestrator.ReadingModeCapabilities,
        isFlagEnabled: Bool
    ) -> ReadingModeOrchestrator.OrchestratorDecision {
        let input = ReadingModeOrchestrator.OrchestratorDecisionInput(
            unreadCount: unreadCount,
            lastOpenedAt: lastOpenedAt,
            now: now,
            stickyChoice: preference(for: stickyMode),
            capabilities: capabilities,
            isFlagEnabled: isFlagEnabled
        )
        return ReadingModeOrchestrator.resolveOrchestratorDecision(input)
    }

    /// Réciproque de `stickyMode(for:)` (privée côté
    /// `ReadingModeOrchestrator` — ce contrôleur la reconstruit plutôt que
    /// de la dupliquer aveuglément) : traduit un mode RENDU mémorisé en
    /// préférence (les mots du menu) que l'orchestrateur consomme en entrée.
    /// `.bubbles` n'est jamais un choix mémorisable (mode de repli drapeau
    /// OFF, absent du catalogue sélectionnable) — replié sur `.auto` par
    /// défense plutôt que sur une préférence qui n'existe pas côté loi.
    private static func preference(
        for mode: ConversationReadingMode?
    ) -> ReadingModeOrchestrator.ReadingModePreference {
        guard let mode else { return .auto }
        switch mode {
        case .focal: return .focal
        case .script: return .script
        case .summary: return .resume
        case .river: return .riviere
        case .bubbles: return .auto
        }
    }
}
