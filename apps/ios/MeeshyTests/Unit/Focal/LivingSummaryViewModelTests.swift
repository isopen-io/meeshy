import XCTest
import MeeshySDK
@testable import Meeshy

/// F-088 (WS-9) — `LivingSummaryViewModel` : cache-first (digest immédiat,
/// enrichissement agent en arrière-plan, jamais bloquant), écran jamais
/// vide, silence total sur erreur/absence d'agent.
@MainActor
final class LivingSummaryViewModelTests: XCTestCase {

    private func makeDigest(messageCount: Int = 0, isComplete: Bool = true) -> DeterministicConversationDigest {
        DeterministicConversationDigest(
            messageCount: messageCount, participantCount: messageCount > 0 ? 1 : 0,
            start: messageCount > 0 ? Date() : nil, end: messageCount > 0 ? Date() : nil,
            topSenders: [], languages: [], media: .empty,
            awaitingYou: [], episodes: [], isComplete: isComplete
        )
    }

    // MARK: - Cache-first : le digest s'affiche immédiatement

    func test_init_exposesDigestAndFaceRampImmediately_noAsyncWait() {
        let digest = makeDigest(messageCount: 12)
        let ramp = [FaceRampEntry(id: "u1", displayName: "Ali", avatarURL: nil, colorHex: "#31B6BA", presence: .online, awaitingCount: 2, needScore: 5, evidenceMessageIds: ["m1"])]
        let vm = LivingSummaryViewModel(digest: digest, faceRamp: ramp, analysisProvider: nil, conversationId: "c1")

        XCTAssertEqual(vm.digest.messageCount, 12)
        XCTAssertEqual(vm.faceRamp.count, 1)
        XCTAssertNil(vm.agentSummary)
    }

    // MARK: - Squelette UNIQUEMENT sur cache vide

    func test_showsSkeleton_trueWhenEverythingEmpty() {
        let vm = LivingSummaryViewModel(digest: makeDigest(messageCount: 0), faceRamp: [], analysisProvider: nil, conversationId: "c1")
        XCTAssertTrue(vm.showsSkeleton)
    }

    func test_showsSkeleton_falseWhenDigestHasMessages() {
        let vm = LivingSummaryViewModel(digest: makeDigest(messageCount: 5), faceRamp: [], analysisProvider: nil, conversationId: "c1")
        XCTAssertFalse(vm.showsSkeleton)
    }

    func test_showsSkeleton_falseWhenFaceRampNonEmptyEvenIfDigestEmpty() {
        let ramp = [FaceRampEntry(id: "u1", displayName: "Ali", avatarURL: nil, colorHex: "#31B6BA", presence: .online, awaitingCount: 1, needScore: 5, evidenceMessageIds: ["m1"])]
        let vm = LivingSummaryViewModel(digest: makeDigest(messageCount: 0), faceRamp: ramp, analysisProvider: nil, conversationId: "c1")
        XCTAssertFalse(vm.showsSkeleton)
    }

    // MARK: - L'écran n'est JAMAIS vide

    func test_isEmpty_alwaysFalse() {
        let vm = LivingSummaryViewModel(digest: makeDigest(), faceRamp: [], analysisProvider: nil, conversationId: "c1")
        XCTAssertFalse(vm.isEmpty)
    }

    // MARK: - Invité : provider nil ⇒ AUCUNE tentative réseau (§5)

    func test_refreshAgentEnrichment_nilProvider_isNoOp_staysNilAndNotRefreshing() async {
        let vm = LivingSummaryViewModel(digest: makeDigest(messageCount: 3), faceRamp: [], analysisProvider: nil, conversationId: "c1")
        await vm.refreshAgentEnrichment()
        XCTAssertNil(vm.agentSummary)
        XCTAssertFalse(vm.isRefreshingAgent)
    }

    // MARK: - summary != nil ⇒ affiché

    func test_refreshAgentEnrichment_success_withSummary_populatesAgentSummary() async {
        let provider = MockConversationAnalysisProvider()
        let summary = ConversationSummaryAnalysis(text: "Ambiance détendue.", messageCount: 42)
        provider.fetchAnalysisResult = .success(ConversationAnalysis(conversationId: "c1", summary: summary))

        let vm = LivingSummaryViewModel(digest: makeDigest(messageCount: 3), faceRamp: [], analysisProvider: provider, conversationId: "c1")
        await vm.refreshAgentEnrichment()

        XCTAssertEqual(vm.agentSummary?.text, "Ambiance détendue.")
        XCTAssertEqual(provider.fetchAnalysisCallCount, 1)
        XCTAssertEqual(provider.lastFetchAnalysisConversationId, "c1")
        XCTAssertFalse(vm.isRefreshingAgent)
    }

    // MARK: - summary == nil ⇒ aucune ligne agent, digest reste seul, écran pas vide

    func test_refreshAgentEnrichment_success_withNilSummary_leavesDigestAlone() async {
        let provider = MockConversationAnalysisProvider()
        provider.fetchAnalysisResult = .success(ConversationAnalysis(conversationId: "c1", summary: nil))

        let vm = LivingSummaryViewModel(digest: makeDigest(messageCount: 3), faceRamp: [], analysisProvider: provider, conversationId: "c1")
        await vm.refreshAgentEnrichment()

        XCTAssertNil(vm.agentSummary)
        XCTAssertEqual(vm.digest.messageCount, 3, "le digest déterministe reste intact, indépendant de l'agent")
        XCTAssertFalse(vm.showsSkeleton, "l'écran n'est pas vide : le digest a des messages")
    }

    // MARK: - Erreur (403 invité simulé, ou toute autre) ⇒ silence total

    func test_refreshAgentEnrichment_error_isSilent_noCrashNoErrorState() async {
        let provider = MockConversationAnalysisProvider()
        provider.fetchAnalysisResult = .failure(MockAnalysisError())

        let vm = LivingSummaryViewModel(digest: makeDigest(messageCount: 3), faceRamp: [], analysisProvider: provider, conversationId: "c1")
        await vm.refreshAgentEnrichment()

        XCTAssertNil(vm.agentSummary)
        XCTAssertFalse(vm.isRefreshingAgent)
    }
}
