import Foundation
import MeeshySDK
@testable import Meeshy

/// Double de test pour `ConversationAnalysisProviding` — patron
/// `MockMessageService` (contrat §WS-9) : `Result<T, Error>` par méthode,
/// compteurs d'appel, derniers arguments.
final class MockConversationAnalysisProvider: ConversationAnalysisProviding, @unchecked Sendable {

    var fetchAnalysisResult: Result<ConversationAnalysis, Error> = .success(
        ConversationAnalysis(conversationId: "c1")
    )
    var fetchAnalysisCallCount = 0
    var lastFetchAnalysisConversationId: String?

    var fetchStatsResult: Result<ConversationMessageStatsResponse, Error> = .success(
        ConversationMessageStatsResponse(conversationId: "c1")
    )
    var fetchStatsCallCount = 0
    var lastFetchStatsConversationId: String?

    func fetchAnalysis(conversationId: String) async throws -> ConversationAnalysis {
        fetchAnalysisCallCount += 1
        lastFetchAnalysisConversationId = conversationId
        return try fetchAnalysisResult.get()
    }

    func fetchStats(conversationId: String) async throws -> ConversationMessageStatsResponse {
        fetchStatsCallCount += 1
        lastFetchStatsConversationId = conversationId
        return try fetchStatsResult.get()
    }
}

/// Erreur nue pour simuler un 403 invité (§WS-9 : « erreur 403 ⇒ identique,
/// sans message d'erreur »). Le VM ne distingue pas les codes HTTP — toute
/// erreur retombe silencieusement sur le digest déterministe seul — donc
/// une erreur générique suffit à prouver le comportement.
struct MockAnalysisError: Error {}
