import XCTest
@testable import MeeshySDK

/// Cycle 99 — `conversation:join-error` : le motif du refus DÉCIDE.
///
/// La passerelle (`ConversationHandler.handleConversationJoin`) refuse une
/// jonction sur huit sites portant sept motifs distincts. Trois établissent la
/// non-appartenance ; quatre sont transitoires. `ConversationSocketHandler` les
/// traitait tous comme une révocation d'accès : il purgeait le cache du fil et
/// le fermait sous un bandeau « accès révoqué » — y compris quand la passerelle
/// disait seulement « trop de requêtes » ou « erreur serveur ».
///
/// Chaque motif de production est énuméré ici NOMMÉMENT. Les quatre témoins
/// transitoires sont écrits en NÉGATIF (`XCTAssertFalse`) parce que c'est la
/// forme exacte du défaut : ce qui était vrai pour tous doit rester faux pour
/// eux.
///
/// JUMEAU TypeScript : `packages/shared/__tests__/conversation-join-error.test.ts`.
final class ConversationJoinErrorEventTests: XCTestCase {

    private let decoder = JSONDecoder()

    private func event(reason: String?) throws -> ConversationJoinErrorEvent {
        let reasonField = reason.map { "\"\($0)\"" } ?? "null"
        let json = """
        {
            "conversationId": "68a1b2c3d4e5f60718293a4b",
            "reason": \(reasonField),
            "message": "peu importe"
        }
        """.data(using: .utf8)!
        return try decoder.decode(ConversationJoinErrorEvent.self, from: json)
    }

    // MARK: - Décodage

    func test_decode_allFields() throws {
        let decoded = try event(reason: "banned")
        XCTAssertEqual(decoded.conversationId, "68a1b2c3d4e5f60718293a4b")
        XCTAssertEqual(decoded.reason, "banned")
        XCTAssertEqual(decoded.message, "peu importe")
    }

    /// `reason` et `message` sont optionnels : une passerelle antérieure au
    /// contrat ne les portait pas, et un événement amputé doit rester décodable
    /// plutôt que d'être jeté en entier.
    func test_decode_reasonAndMessageAbsents() throws {
        let json = """
        { "conversationId": "68a1b2c3d4e5f60718293a4b" }
        """.data(using: .utf8)!
        let decoded = try decoder.decode(ConversationJoinErrorEvent.self, from: json)
        XCTAssertEqual(decoded.conversationId, "68a1b2c3d4e5f60718293a4b")
        XCTAssertNil(decoded.reason)
        XCTAssertNil(decoded.message)
    }

    // MARK: - Les trois motifs qui ÉTABLISSENT la non-appartenance

    func test_isMembershipDenied_notAMember() throws {
        XCTAssertTrue(try event(reason: "not_a_member").isMembershipDenied)
    }

    func test_isMembershipDenied_banned() throws {
        XCTAssertTrue(try event(reason: "banned").isMembershipDenied)
    }

    func test_isMembershipDenied_noLongerMember() throws {
        XCTAssertTrue(try event(reason: "no_longer_member").isMembershipDenied)
    }

    // MARK: - Les quatre motifs TRANSITOIRES — rien ne doit être détruit

    func test_isMembershipDenied_rateLimited_estFaux() throws {
        XCTAssertFalse(try event(reason: "rate_limited").isMembershipDenied)
    }

    func test_isMembershipDenied_serverError_estFaux() throws {
        XCTAssertFalse(try event(reason: "server_error").isMembershipDenied)
    }

    func test_isMembershipDenied_notAuthenticated_estFaux() throws {
        XCTAssertFalse(try event(reason: "not_authenticated").isMembershipDenied)
    }

    func test_isMembershipDenied_invalidPayload_estFaux() throws {
        XCTAssertFalse(try event(reason: "invalid_payload").isMembershipDenied)
    }

    // MARK: - L'inconnu ne détruit pas

    /// Liste d'AUTORISATION : une passerelle plus récente que ce client peut
    /// émettre un motif qu'il ne connaît pas. Ne pas savoir lire n'autorise pas
    /// à détruire — même règle que `MeeshyConversation.bridge`.
    func test_isMembershipDenied_motifInconnu_estFaux() throws {
        XCTAssertFalse(try event(reason: "a_reason_a_future_gateway_adds").isMembershipDenied)
    }

    func test_isMembershipDenied_motifAbsent_estFaux() throws {
        XCTAssertFalse(try event(reason: nil).isMembershipDenied)
    }

    /// Le rapprochement est EXACT : ni casse, ni espaces. Un motif qui n'est pas
    /// littéralement l'un des trois ne vaut pas révocation.
    func test_isMembershipDenied_rapprochementExact() throws {
        XCTAssertFalse(try event(reason: "BANNED").isMembershipDenied)
        XCTAssertFalse(try event(reason: "banned ").isMembershipDenied)
        XCTAssertFalse(try event(reason: "").isMembershipDenied)
    }
}
