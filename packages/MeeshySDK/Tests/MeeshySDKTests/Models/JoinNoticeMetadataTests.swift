import XCTest
@testable import MeeshySDK

/// L'avis d'arrivée — « X a rejoint la conversation ».
///
/// `Message.metadata` est un blob JSON partagé par TOUTES les familles de
/// messages système. Un décodeur permissif rendrait une carte d'arrivée pour un
/// résumé d'appel : le rendu dédié COURT-CIRCUITE le rendu ordinaire, donc une
/// mauvaise reconnaissance ne dégrade pas — elle remplace. `kind` est donc un
/// GARDE, exactement comme dans `CallSummaryMetadata`.
///
/// Le texte du message n'est qu'un repli français : tout le sens vit ici, pour
/// que chaque lecteur le voie dans SA langue (Prisme Linguistique). Un `content`
/// figé en base ne peut pas suivre le prisme ; une métadonnée, si.
final class JoinNoticeMetadataTests: XCTestCase {

    private func decode(_ object: [String: Any]) -> JoinNoticeMetadata? {
        let data = try! JSONSerialization.data(withJSONObject: object)
        return try? JSONDecoder().decode(JoinNoticeMetadata.self, from: data)
    }

    private let valid: [String: Any] = [
        "kind": "member-joined",
        "participantId": "p1",
        "displayName": "ano_bob_sm123",
        "isAnonymous": true,
        "viaShareLink": true,
    ]

    func test_decode_readsTheWholeNotice() {
        let notice = decode(valid)

        XCTAssertEqual(notice?.participantId, "p1")
        XCTAssertEqual(notice?.displayName, "ano_bob_sm123")
        XCTAssertEqual(notice?.isAnonymous, true)
        XCTAssertEqual(notice?.viaShareLink, true)
    }

    func test_decode_rejectsAnotherSystemFamily() {
        XCTAssertNil(decode(["kind": "call", "callId": "c1"]))
        XCTAssertNil(decode(["kind": "call-live", "callId": "c1"]))
    }

    func test_decode_rejectsMetadataWithoutKind() {
        XCTAssertNil(decode(["participantId": "p1", "displayName": "Bob"]))
    }

    /// Sans nom, la carte n'a rien à dire — mieux vaut le rendu ordinaire
    /// qu'une notice vide.
    func test_decode_rejectsANoticeThatNamesNobody() {
        XCTAssertNil(decode(["kind": "member-joined", "participantId": "p1"]))
        XCTAssertNil(decode(["kind": "member-joined", "displayName": "Bob"]))
    }

    /// Les deux drapeaux décident d'un AFFICHAGE — « sans compte », « par lien ».
    /// Une valeur absente ne doit jamais devenir une affirmation.
    func test_decode_absentFlagsAssertNothing() {
        let bare = decode(["kind": "member-joined", "participantId": "p1", "displayName": "Alice"])

        XCTAssertEqual(bare?.isAnonymous, false)
        XCTAssertEqual(bare?.viaShareLink, false)
    }

    // MARK: - Le trajet complet, depuis un APIMessage

    private func message(metadata: [String: Any]?) -> MeeshyMessage {
        var json: [String: Any] = [
            "id": "m1",
            "conversationId": "c1",
            "senderId": "p1",
            "content": "Bob a rejoint la conversation",
            "originalLanguage": "fr",
            "messageType": "system",
            "messageSource": "system",
            "createdAt": ISO8601DateFormatter().string(from: Date()),
        ]
        if let metadata { json["metadata"] = metadata }
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIMessage.self, from: data).toMessage(currentUserId: "someone-else")
    }

    func test_message_carriesTheNotice() {
        XCTAssertEqual(message(metadata: valid).joinNotice?.displayName, "ano_bob_sm123")
    }

    func test_message_withoutMetadata_hasNoNotice() {
        XCTAssertNil(message(metadata: nil).joinNotice)
    }

    /// Contre-épreuve du garde, au niveau du message cette fois : un résumé
    /// d'appel ne doit jamais ressortir en avis d'arrivée.
    func test_message_callSummary_isNotAJoinNotice() {
        let call: [String: Any] = [
            "kind": "call",
            "callId": "call-1",
            "initiatorId": "u1",
            "callType": "audio",
            "outcome": "completed",
        ]

        XCTAssertNil(message(metadata: call).joinNotice)
    }
}
