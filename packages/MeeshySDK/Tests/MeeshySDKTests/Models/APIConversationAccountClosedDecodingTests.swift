import XCTest
@testable import MeeshySDK

/// #15887 (dépend de #15717) — la passerelle sert `accountClosed: true` sur le
/// PARTICIPANT dont le compte est supprimé ou désactivé, et aucune clé sinon.
/// Le SDK le décode, le porte jusqu'à `MeeshyConversation` pour le pair d'une
/// directe, et le cache le garde. Charge ADDITIVE : un serveur ancien, ou une
/// ligne de cache écrite avant ce champ, rend un compte ouvert.
final class APIConversationAccountClosedDecodingTests: XCTestCase {

    private func decode(_ payload: [String: Any]) throws -> APIConversation {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIConversation.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    private func payload(type: String, peerClosed: Any?) -> [String: Any] {
        var peer: [String: Any] = ["id": "p2", "userId": "u2", "displayName": "Bob"]
        if let peerClosed { peer["accountClosed"] = peerClosed }
        return [
            "id": "conv1",
            "type": type,
            "createdAt": "2026-11-03T10:00:00Z",
            "participants": [["id": "p1", "userId": "moi", "displayName": "Moi"], peer],
        ]
    }

    private func row(type: String = "direct", peerClosed: Any?) throws -> MeeshyConversation {
        try decode(payload(type: type, peerClosed: peerClosed)).toConversation(currentUserId: "moi")
    }

    // MARK: - Le participant

    func test_theParticipant_decodesAClosedAccount() throws {
        let peer = try decode(payload(type: "direct", peerClosed: true)).participants?.last
        XCTAssertEqual(peer?.accountClosed, true)
    }

    func test_anOldServer_servesNoKey_andTheAccountStaysOpen() throws {
        let peer = try decode(payload(type: "direct", peerClosed: nil)).participants?.last
        XCTAssertNil(peer?.accountClosed)
    }

    // MARK: - La ligne

    func test_aDirectWithAClosedPeer_carriesTheClosure() throws {
        XCTAssertTrue(try row(peerClosed: true).participantAccountClosed)
    }

    func test_aDirectWithAnOpenPeer_carriesNoClosure() throws {
        XCTAssertFalse(try row(peerClosed: nil).participantAccountClosed)
        XCTAssertFalse(try row(peerClosed: false).participantAccountClosed)
    }

    func test_aGroup_carriesNoPeerClosure() throws {
        XCTAssertFalse(try row(type: "group", peerClosed: true).participantAccountClosed)
    }

    // MARK: - Le cache

    func test_theClosureSurvivesTheCache() throws {
        let conversation = try row(peerClosed: true)
        let restored = try JSONDecoder().decode(MeeshyConversation.self, from: JSONEncoder().encode(conversation))
        XCTAssertTrue(restored.participantAccountClosed)
    }

    func test_aCacheRowWrittenBeforeTheField_readsAnOpenAccount() throws {
        let conversation = try row(peerClosed: nil)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(conversation)) as? [String: Any])
        json.removeValue(forKey: "participantAccountClosed")
        let restored = try JSONDecoder().decode(MeeshyConversation.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertFalse(restored.participantAccountClosed)
    }

    func test_aClosureArriving_repaintsTheRow() throws {
        XCTAssertNotEqual(
            try row(peerClosed: nil).renderFingerprint,
            try row(peerClosed: true).renderFingerprint,
            "la ligne de liste est `.equatable()` sur cette empreinte, et sa cible d'avatar en dépend"
        )
    }

    // MARK: - L'identité de l'interlocuteur voyage d'un bloc

    func test_keepingTheInterlocutor_keepsItsClosure() throws {
        let known = try row(peerClosed: true)
        var served = known
        served.participantUserId = nil
        served.participantAccountClosed = false
        XCTAssertTrue(served.keepingInterlocutor(of: known).participantAccountClosed)
    }

    func test_droppingAFalseInterlocutor_dropsItsClosure() throws {
        XCTAssertFalse(try row(peerClosed: true).withoutInterlocutor().participantAccountClosed)
    }

    func test_adoptingTheServedIdentity_adoptsItsClosure() throws {
        let cached = try row(peerClosed: nil)
        let served = try row(peerClosed: true)
        XCTAssertTrue(cached.adoptingServedIdentity(of: served).participantAccountClosed)
        XCTAssertFalse(served.adoptingServedIdentity(of: cached).participantAccountClosed)
    }
}
