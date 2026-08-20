import XCTest
@testable import Meeshy

@MainActor
final class ForwardTargetMergeTests: XCTestCase {
    private func conv(_ id: String, userId: String? = nil, title: String = "C") -> ForwardTarget {
        ForwardTarget(id: "conv:\(id)", kind: .conversation, conversationId: id, userId: userId,
                      title: title, subtitle: nil, avatarURL: nil)
    }
    private func contact(_ userId: String, title: String = "P") -> ForwardTarget {
        ForwardTarget(id: "user:\(userId)", kind: .contact, conversationId: nil, userId: userId,
                      title: title, subtitle: nil, avatarURL: nil)
    }

    func test_merge_keepsConversationsFirst() {
        let out = ForwardTargetMerge.merge(conversations: [conv("c1"), conv("c2")], contacts: [contact("u9")])
        XCTAssertEqual(out.map(\.id), ["conv:c1", "conv:c2", "user:u9"])
    }

    func test_merge_absorbsContactAlreadyInADirectConversation() {
        let out = ForwardTargetMerge.merge(conversations: [conv("c1", userId: "u1")], contacts: [contact("u1"), contact("u2")])
        XCTAssertEqual(out.map(\.id), ["conv:c1", "user:u2"],
                       "une personne déjà jointe par une conversation directe ne doit pas apparaître deux fois")
    }

    func test_merge_deduplicatesRepeatedConversations() {
        let out = ForwardTargetMerge.merge(conversations: [conv("c1"), conv("c1")], contacts: [])
        XCTAssertEqual(out.map(\.id), ["conv:c1"])
    }

    func test_merge_withoutUserId_neverAbsorbs() {
        let out = ForwardTargetMerge.merge(conversations: [conv("g1")], contacts: [contact("u1")])
        XCTAssertEqual(out.map(\.id), ["conv:g1", "user:u1"],
                       "un groupe n'absorbe personne — seule une conversation directe le peut")
    }

    // MARK: - Appartenance (drapeau serveur, décision du user 2026-08-19)

    /// Le drapeau serveur PRIME sur le tableau `participants` : celui-ci est
    /// tronqué à cinq et n'est plus émis du tout pour un non-membre — il ne
    /// peut donc jamais prouver la non-appartenance.
    func test_isReachable_serverFlagWins_overTruncatedParticipants() {
        XCTAssertTrue(ForwardTargetMerge.isReachableConversation(
            type: "public", participantUserIds: ["u1", "u2"], currentUserId: "me", isMember: true))
        XCTAssertFalse(ForwardTargetMerge.isReachableConversation(
            type: "public", participantUserIds: ["me"], currentUserId: "me", isMember: false))
    }

    /// Gateway antérieur : sans drapeau, l'heuristique historique reste la
    /// règle — un client à jour ne doit pas perdre ses résultats.
    func test_isReachable_withoutFlag_fallsBackToParticipants() {
        XCTAssertTrue(ForwardTargetMerge.isReachableConversation(
            type: "public", participantUserIds: ["u1", "me"], currentUserId: "me", isMember: nil))
        XCTAssertFalse(ForwardTargetMerge.isReachableConversation(
            type: "public", participantUserIds: ["u1", "u2"], currentUserId: "me", isMember: nil))
        XCTAssertTrue(ForwardTargetMerge.isReachableConversation(
            type: "group", participantUserIds: [], currentUserId: "me", isMember: nil),
                      "hors public/global, l'appartenance est garantie par la clause WHERE de la route")
    }
}
