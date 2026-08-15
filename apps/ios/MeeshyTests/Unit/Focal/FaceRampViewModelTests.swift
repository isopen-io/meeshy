import XCTest
import MeeshySDK
@testable import Meeshy

/// F-088 (WS-9) — le contrat de données qui porte « répondre à Sarah en
/// moins de 5 secondes, sans jamais voir les 98 autres messages » (critère
/// §WS-9). Pas de vue SwiftUI exercée ici (R5, aucun simulateur) : ce test
/// prouve que `LivingSummaryViewModel.faceRamp` porte, PAR ENTRÉE, tout ce
/// dont `onReplyToPerson` a besoin pour pré-adresser le composeur — le tri
/// EST celui de `FaceRampRanking` (WS-8), jamais recalculé ni retrié ici.
@MainActor
final class FaceRampViewModelTests: XCTestCase {

    private func digest() -> DeterministicConversationDigest {
        DeterministicConversationDigest(
            messageCount: 10, participantCount: 3, start: Date(), end: Date(),
            topSenders: [], languages: [], media: .empty, awaitingYou: [], episodes: [], isComplete: true
        )
    }

    // MARK: - Le tri de la Rampe est celui de FaceRampRanking, jamais retrié

    func test_faceRamp_preservesTheOrderProvidedAtConstruction() {
        let ranked = FaceRampRanking.rank(
            entries: [
                FaceRampRankingInput(
                    id: "adam", displayName: "Adam", avatarURL: nil, colorHex: "#31B6BA", presence: .offline,
                    mentionEvidence: [], directReplyEvidence: [], unansweredQuestionEvidence: [], mostRecentEvidenceAt: nil
                ),
                FaceRampRankingInput(
                    id: "karim", displayName: "Karim", avatarURL: nil, colorHex: "#31B6BA", presence: .online,
                    mentionEvidence: ["m1", "m2", "m3"], directReplyEvidence: [], unansweredQuestionEvidence: [], mostRecentEvidenceAt: Date()
                ),
            ],
            now: Date()
        )

        let vm = LivingSummaryViewModel(digest: digest(), faceRamp: ranked, analysisProvider: nil, conversationId: "c1")

        XCTAssertEqual(vm.faceRamp.map(\.displayName), ["Karim", "Adam"], "Karim d'abord — il a des messages en attente")
    }

    // MARK: - Chaque entrée porte SES preuves — le pré-adressage du composeur

    func test_entry_evidenceMessageIds_areExactlyTheMessagesConcerningThisPerson() {
        let entries = FaceRampRanking.rank(
            entries: [
                FaceRampRankingInput(
                    id: "sarah", displayName: "Sarah", avatarURL: nil, colorHex: "#31B6BA", presence: .online,
                    mentionEvidence: ["m10"], directReplyEvidence: ["m11"], unansweredQuestionEvidence: [],
                    mostRecentEvidenceAt: Date()
                ),
            ],
            now: Date()
        )
        let vm = LivingSummaryViewModel(digest: digest(), faceRamp: entries, analysisProvider: nil, conversationId: "c1")

        let sarah = vm.faceRamp.first { $0.id == "sarah" }
        XCTAssertNotNil(sarah)
        XCTAssertEqual(Set(sarah?.evidenceMessageIds ?? []), Set(["m10", "m11"]))
        XCTAssertFalse(sarah?.evidenceMessageIds.isEmpty ?? true, "jamais une entrée sans preuve — je dois voir SES messages, pas les 98 autres")
    }

    // MARK: - Rampe vide ⇒ aucune entrée, jamais fabriquée

    func test_emptyFaceRamp_staysEmpty_neverFabricatesAnEntry() {
        let vm = LivingSummaryViewModel(digest: digest(), faceRamp: [], analysisProvider: nil, conversationId: "c1")
        XCTAssertEqual(vm.faceRamp, [])
    }
}
