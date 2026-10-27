import Foundation
import MeeshySDK

/// Protocole côté app pour `ConversationAnalysisService` (contrat §WS-9) —
/// le SDK n'en déclare aucun (violation de la règle TDD iOS : un service
/// injecté sans protocole ne peut pas être substitué en test). RE-PREUVE :
/// `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationAnalysisService.swift`
/// est un `final class` nu, deux méthodes, aucun protocole — signature
/// vérifiée mot pour mot avant écriture de ce fichier.
///
/// Étage RÉEL (contrat §6.1, PAS un stub) : `GET /conversations/:id/analysis`
/// et `GET /conversations/:id/stats` existent déjà côté serveur et sont déjà
/// consommés par le SDK (E15) — à distinguer du `AgentAssistProviding` de
/// WS-10 (`assist:*`), qui LUI est stubé derrière `NullAgentAssistProvider`
/// car ces routes-là n'existent nulle part. Ce protocole habille un service
/// déjà vivant ; il ne fabrique rien de nouveau côté serveur.
///
/// **C2, appliquée ici** : `ConversationAnalysisService.fetchAnalysis` rend
/// un résumé PORTÉE CONVERSATION ENTIÈRE, pas borné à la fenêtre non lue du
/// lecteur (`tasks/lentille-implementation-contract.md` §5.1 : « portée
/// globale, pas "ce que TU as manqué" — partiel côté serveur aujourd'hui »).
/// `LivingSummaryViewModel` ne mélange donc JAMAIS ce texte aux comptes du
/// digest déterministe — il vit dans son propre panneau, jamais présenté
/// comme couvrant le non-lu.
protocol ConversationAnalysisProviding: Sendable {
    func fetchAnalysis(conversationId: String) async throws -> ConversationAnalysis
    func fetchStats(conversationId: String) async throws -> ConversationMessageStatsResponse
}

extension ConversationAnalysisService: ConversationAnalysisProviding {}
