import XCTest
@testable import Meeshy

/// F-087 (WS-8) — `FaceRampRanking.rank`/`makeInputs` : score sur signaux
/// réels uniquement, tri stable/déterministe (jamais `hashValue`), badge =
/// compte de preuves (jamais le score). Critère §7 : « Karim d'abord : il a
/// trois messages sans réponse ».
final class FaceRampRankingTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func input(
        id: String,
        name: String,
        mentions: [String] = [],
        replies: [String] = [],
        questions: [String] = [],
        mostRecentEvidenceAt: Date? = nil
    ) -> FaceRampRankingInput {
        FaceRampRankingInput(
            id: id, displayName: name, avatarURL: nil, colorHex: "#31B6BA", presence: .offline,
            mentionEvidence: mentions, directReplyEvidence: replies, unansweredQuestionEvidence: questions,
            mostRecentEvidenceAt: mostRecentEvidenceAt
        )
    }

    // MARK: - Poids gelés (§3.7)

    func test_weights_matchContract() {
        XCTAssertEqual(FaceRampRanking.mentionWeight, 5)
        XCTAssertEqual(FaceRampRanking.directReplyWeight, 3)
        XCTAssertEqual(FaceRampRanking.unansweredQuestionWeight, 2)
        XCTAssertEqual(FaceRampRanking.recencyWeight, 1)
        XCTAssertEqual(FaceRampRanking.recencyHalfLife, 7 * 24 * 3600)
    }

    // MARK: - « Karim d'abord »

    func test_karimWithThreeUnansweredQuestions_ranksFirst() {
        let entries = [
            input(id: "u1", name: "Alice", questions: []),
            input(id: "karim", name: "Karim", questions: ["q1", "q2", "q3"]),
            input(id: "u2", name: "Bob", replies: ["r1"]),
        ]
        let ranked = FaceRampRanking.rank(entries: entries, now: now)
        XCTAssertEqual(ranked.first?.id, "karim")
    }

    // MARK: - Badge = compte de preuves, JAMAIS le score

    func test_awaitingCount_isEvidenceCount_notScore() {
        let entries = [input(id: "u1", name: "Alice", mentions: ["m1"], replies: ["m2"], questions: ["m3"])]
        let ranked = FaceRampRanking.rank(entries: entries, now: now)
        // score = 5 + 3 + 2 = 10 ; badge = 3 preuves distinctes
        XCTAssertEqual(ranked[0].needScore, 10)
        XCTAssertEqual(ranked[0].awaitingCount, 3)
    }

    func test_awaitingCount_dedupsSharedEvidenceAcrossKinds() {
        // Un même message peut être À LA FOIS une mention et une question —
        // il ne doit compter qu'UNE fois dans le badge.
        let entries = [input(id: "u1", name: "Alice", mentions: ["m1"], questions: ["m1"])]
        let ranked = FaceRampRanking.rank(entries: entries, now: now)
        XCTAssertEqual(ranked[0].awaitingCount, 1)
        XCTAssertEqual(ranked[0].evidenceMessageIds, ["m1"])
    }

    // MARK: - Tri secondaire alphabétique (départage), jamais hashValue

    func test_tieBrokenAlphabeticallyByDisplayName() {
        let entries = [
            input(id: "z", name: "Zoé", mentions: ["m1"]),
            input(id: "a", name: "Adam", mentions: ["m2"]),
        ]
        let ranked = FaceRampRanking.rank(entries: entries, now: now)
        XCTAssertEqual(ranked.map(\.displayName), ["Adam", "Zoé"])
    }

    func test_zeroSignalEntries_rankLast_sortedAlphabetically() {
        let entries = [
            input(id: "karim", name: "Karim", questions: ["q1"]),
            input(id: "zoe", name: "Zoé"),
            input(id: "adam", name: "Adam"),
        ]
        let ranked = FaceRampRanking.rank(entries: entries, now: now)
        XCTAssertEqual(ranked.map(\.displayName), ["Karim", "Adam", "Zoé"])
    }

    // MARK: - Récence — décroissance demi-vie 7 j

    func test_recency_atHalfLife_contributesHalfWeight() {
        let sevenDaysAgo = now.addingTimeInterval(-FaceRampRanking.recencyHalfLife)
        let entries = [input(id: "u1", name: "Alice", mostRecentEvidenceAt: sevenDaysAgo)]
        let ranked = FaceRampRanking.rank(entries: entries, now: now)
        XCTAssertEqual(ranked[0].needScore, 0.5, accuracy: 0.0001)
    }

    func test_recency_rightNow_contributesFullWeight() {
        let entries = [input(id: "u1", name: "Alice", mostRecentEvidenceAt: now)]
        let ranked = FaceRampRanking.rank(entries: entries, now: now)
        XCTAssertEqual(ranked[0].needScore, 1.0, accuracy: 0.0001)
    }

    func test_recency_nilEvidence_contributesZero() {
        let entries = [input(id: "u1", name: "Alice")]
        let ranked = FaceRampRanking.rank(entries: entries, now: now)
        XCTAssertEqual(ranked[0].needScore, 0)
    }

    // MARK: - makeInputs — assemblage depuis le digest

    private func awaitingItem(id: String, kind: AwaitingItem.Kind, from: String, evidence: [String], at: Date) -> AwaitingItem {
        AwaitingItem(id: id, kind: kind, fromUserId: from, evidenceMessageIds: evidence, at: at)!
    }

    func test_makeInputs_groupsByFromUserId_resolvesKnownParticipant() {
        let items = [
            awaitingItem(id: "a1", kind: .mention, from: "karim", evidence: ["m1"], at: now),
            awaitingItem(id: "a2", kind: .unansweredQuestion, from: "karim", evidence: ["m2"], at: now.addingTimeInterval(10)),
        ]
        let participants = [DigestParticipant(id: "karim", displayName: "Karim", avatarURL: nil, colorHex: "#31B6BA", presence: .online)]

        let inputs = FaceRampRanking.makeInputs(awaitingYou: items, participants: participants)

        XCTAssertEqual(inputs.count, 1)
        XCTAssertEqual(inputs[0].id, "karim")
        XCTAssertEqual(inputs[0].displayName, "Karim")
        XCTAssertEqual(inputs[0].mentionEvidence, ["m1"])
        XCTAssertEqual(inputs[0].unansweredQuestionEvidence, ["m2"])
    }

    func test_makeInputs_skipsUnknownParticipant_zeroFabricatedIdentity() {
        let items = [awaitingItem(id: "a1", kind: .mention, from: "ghost", evidence: ["m1"], at: now)]
        let inputs = FaceRampRanking.makeInputs(awaitingYou: items, participants: [])
        XCTAssertTrue(inputs.isEmpty, "aucun nom/avatar connu pour « ghost » — aucune entrée fabriquée")
    }

    func test_makeInputs_thenRank_endToEnd() {
        let items = [
            awaitingItem(id: "a1", kind: .unansweredQuestion, from: "karim", evidence: ["m1"], at: now),
            awaitingItem(id: "a2", kind: .unansweredQuestion, from: "karim", evidence: ["m2"], at: now),
            awaitingItem(id: "a3", kind: .unansweredQuestion, from: "karim", evidence: ["m3"], at: now),
            awaitingItem(id: "a4", kind: .directReply, from: "bob", evidence: ["m4"], at: now),
        ]
        let participants = [
            DigestParticipant(id: "karim", displayName: "Karim", avatarURL: nil, colorHex: "#31B6BA", presence: .online),
            DigestParticipant(id: "bob", displayName: "Bob", avatarURL: nil, colorHex: "#31B6BA", presence: .offline),
        ]
        let ranked = FaceRampRanking.rank(entries: FaceRampRanking.makeInputs(awaitingYou: items, participants: participants), now: now)
        XCTAssertEqual(ranked.first?.displayName, "Karim")
        XCTAssertEqual(ranked.first?.awaitingCount, 3)
    }
}
