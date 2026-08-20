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

    // MARK: - Champs enrichis (pseudo, nom donné, règles du lien)

    func test_decode_readsUsernameGivenNameAndLinkRules() {
        let enriched = valid.merging([
            "username": "ano_Jc_n045",
            "givenName": "Jc Nm",
            "linkRules": ["canSendMessages": true, "canSendFiles": false, "canSendImages": true],
        ]) { _, new in new }

        let notice = decode(enriched)

        XCTAssertEqual(notice?.username, "ano_Jc_n045")
        XCTAssertEqual(notice?.givenName, "Jc Nm")
        XCTAssertEqual(notice?.linkRules?.canSendMessages, true)
        XCTAssertEqual(notice?.linkRules?.canSendFiles, false)
        XCTAssertEqual(notice?.linkRules?.canSendImages, true)
    }

    /// Un avis antérieur à ces champs reste reconnu à l'identique — rien
    /// d'affirmé sur la foi d'une absence.
    func test_decode_absentEnrichedFieldsStayNil() {
        let notice = decode(valid)

        XCTAssertNil(notice?.username)
        XCTAssertNil(notice?.givenName)
        XCTAssertNil(notice?.linkRules)
    }

    // MARK: - Round-trip cache (GRDB persiste MeeshyMessage en Codable)

    /// LE bug du combiné téléphonique : `joinNotice` avait sa CodingKey mais
    /// ni décodage ni encodage — perdu au round-trip disque, toute conversation
    /// ROUVERTE retombait sur la vue système générique (icône téléphone) avec
    /// le repli français, alors que la vue dédiée existait.
    func test_meeshyMessage_codableRoundTrip_preservesJoinNotice() throws {
        var message = MeeshyMessage(
            id: "sys-1",
            conversationId: "conv-1",
            senderId: "p1",
            content: "ano_bob a rejoint la conversation — visiteur sans compte",
            messageSource: .system
        )
        message.joinNotice = JoinNoticeMetadata(
            participantId: "p1",
            displayName: "ano_bob",
            isAnonymous: true,
            viaShareLink: true,
            username: "ano_bob",
            givenName: "Bob Martin",
            linkRules: .init(canSendMessages: true, canSendFiles: false, canSendImages: true)
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let revived = try decoder.decode(MeeshyMessage.self, from: encoder.encode(message))

        XCTAssertEqual(revived.messageSource, .system)
        XCTAssertEqual(revived.joinNotice?.displayName, "ano_bob")
        XCTAssertEqual(revived.joinNotice?.username, "ano_bob")
        XCTAssertEqual(revived.joinNotice?.givenName, "Bob Martin")
        XCTAssertEqual(revived.joinNotice?.linkRules?.canSendImages, true)
    }
}
