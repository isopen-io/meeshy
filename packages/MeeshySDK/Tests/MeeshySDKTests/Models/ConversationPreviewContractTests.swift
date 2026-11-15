import XCTest
@testable import MeeshySDK

/// #7548 — le SDK décode le contrat de la ligne d'aperçu posé par #7545.
///
/// Un champ décodé mais non mappé est aussi inerte qu'un champ absent du fil :
/// ces témoins suivent chaque sous-groupe jusqu'à la LIGNE (`MeeshyConversation`)
/// et jusqu'au cache disque, pas seulement jusqu'au décodeur.
final class ConversationPreviewContractTests: XCTestCase {

    private func wireDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = WireDate.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
            }
            return date
        }
        return decoder
    }

    private func decodeEvent(_ body: [String: Any]) throws -> ConversationUpdatedEvent {
        var payload = body
        payload["conversationId"] = "conv-1"
        payload["updatedAt"] = "2026-09-23T10:00:00.000Z"
        return try wireDecoder().decode(
            ConversationUpdatedEvent.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    private let reaction: [String: Any] = [
        "emoji": "❤️", "reactorId": "p-alice", "reactorUserId": "u-alice", "reactorName": "Alice",
        "messageId": "m-1", "targetSenderId": "p-me", "targetSenderUserId": "u-me",
        "excerpt": "Bonjour", "excerptOriginalLanguage": "fr", "excerptTranslations": NSNull(),
        "excerptProtection": NSNull(), "createdAt": "2026-09-23T10:01:00.000Z",
    ]

    private let activeCall: [String: Any] = [
        "id": "call-1", "kind": "video", "participantCount": 3, "startedAt": "2026-09-23T09:58:00.000Z",
    ]

    private func row(lastMessageAt: Date) -> MeeshyConversation {
        MeeshyConversation(id: "conv-1", identifier: "conv-1", type: .group, lastMessageAt: lastMessageAt,
                           lastMessagePreview: "avant", lastMessageId: "m-0")
    }

    // MARK: - conversation:updated

    func test_conversationUpdated_carriesMediaAndNatureOfTheNamedMessage_toTheRow() throws {
        let event = try decodeEvent([
            "lastMessageId": "m-1",
            "lastMessageAt": "2026-09-23T10:00:00.000Z",
            "lastMessagePreview": "",
            "lastMessageAttachments": [[
                "id": "att-1", "mimeType": "audio/webm", "thumbnailUrl": NSNull(), "originalName": "voix.webm",
                "fileSize": 49152, "duration": 12000, "width": NSNull(), "height": NSNull(),
            ]],
            "lastMessageAttachmentCount": 1,
            "lastMessageType": "audio",
            "lastMessageEffectFlags": 8,
            "lastMessageIsForwarded": true,
            "lastMessageAttachmentSummary": ["count": 1, "kinds": ["audio": 1], "totalSize": 49152],
        ])

        let storeEvent = ConversationStoreSocketBridge.mapConversationUpdated(event, readerId: "u-me")
        let merged = try XCTUnwrap(ConversationStore.merging(
            row(lastMessageAt: Date(timeIntervalSince1970: 0)), with: storeEvent))

        XCTAssertEqual(merged.lastMessageAttachments.map(\.id), ["att-1"])
        XCTAssertEqual(merged.lastMessageAttachments.first?.duration, 12000)
        XCTAssertEqual(merged.lastMessageAttachments.first?.fileSize, 49152)
        XCTAssertEqual(merged.lastMessageNature?.messageType, "audio")
        XCTAssertEqual(merged.lastMessageNature?.effectFlags, 8)
        XCTAssertEqual(merged.lastMessageNature?.isForwarded, true)
        XCTAssertEqual(merged.lastMessageNature?.attachmentSummary?.kinds["audio"], 1)
    }

    func test_conversationUpdated_protectedMessage_keepsItsFlags_withoutAnyAttachment() throws {
        let event = try decodeEvent([
            "lastMessageId": "m-1",
            "lastMessageAt": "2026-09-23T10:00:00.000Z",
            "lastMessageIsViewOnce": true,
            "lastMessageAttachmentSummary": NSNull(),
        ])

        let merged = try XCTUnwrap(ConversationStore.merging(
            row(lastMessageAt: Date(timeIntervalSince1970: 0)),
            with: ConversationStoreSocketBridge.mapConversationUpdated(event)))

        XCTAssertTrue(merged.lastMessageIsViewOnce)
        XCTAssertTrue(merged.lastMessageAttachments.isEmpty)
    }

    func test_conversationUpdated_reactionAndActiveCall_reachTheRow_andNullClearsThem() throws {
        let set = try decodeEvent(["lastReaction": reaction, "activeCall": activeCall])
        let withBoth = try XCTUnwrap(ConversationStore.merging(
            row(lastMessageAt: Date()), with: ConversationStoreSocketBridge.mapConversationUpdated(set)))
        XCTAssertEqual(withBoth.lastReaction?.emoji, "❤️")
        XCTAssertEqual(withBoth.lastReaction?.targetSenderUserId, "u-me")
        XCTAssertEqual(withBoth.activeCall?.participantCount, 3)

        let cleared = try decodeEvent(["activeCall": NSNull()])
        let ended = try XCTUnwrap(ConversationStore.merging(
            withBoth, with: ConversationStoreSocketBridge.mapConversationUpdated(cleared)))
        XCTAssertNil(ended.activeCall, "`null` = l'appel est terminé")
        XCTAssertEqual(ended.lastReaction?.emoji, "❤️", "une clé ABSENTE ne touche à rien")
    }

    func test_conversationUpdated_withoutAnyContractKey_decodesAsBefore() throws {
        let event = try decodeEvent(["title": "Renommé"])

        XCTAssertNil(event.lastMessageNature)
        XCTAssertNil(event.lastMessageAttachments)
        XCTAssertEqual(event.lastReaction, .unchanged)
        XCTAssertEqual(event.activeCall, .unchanged)
    }

    func test_conversationUpdated_aMalformedContractField_neverDropsTheEvent() throws {
        let event = try decodeEvent([
            "lastMessageId": "m-1",
            "lastMessageCallSummary": ["unexpected": true],
        ])

        XCTAssertEqual(event.lastMessage, .replaced("m-1"))
        XCTAssertNil(event.lastMessageNature?.callSummary)
    }

    // MARK: - GET /conversations

    func test_restRow_carriesNatureReactionAndCall() throws {
        let payload: [String: Any] = [
            "id": "conv-1", "type": "group", "createdAt": "2026-09-23T09:00:00.000Z",
            "lastMessage": [
                "id": "m-1", "content": "", "createdAt": "2026-09-23T10:00:00.000Z", "messageType": "text",
                "isEncrypted": false,
                "systemEvent": ["key": "system.member-joined", "params": ["name": "Bob"]],
                "callSummary": [
                    "callId": "c-1", "kind": "audio", "outcome": "completed", "durationSec": 252,
                    "initiatorId": "u-me", "endedByInitiator": false,
                ],
            ],
            "lastReaction": reaction,
            "activeCall": activeCall,
        ]
        let api = try wireDecoder().decode(APIConversation.self, from: JSONSerialization.data(withJSONObject: payload))

        let conversation = api.toConversation(currentUserId: "u-me")

        XCTAssertEqual(conversation.lastMessageNature?.systemEvent?.key, "system.member-joined")
        XCTAssertEqual(conversation.lastMessageNature?.systemEvent?.params["name"]?.rendered, "Bob")
        XCTAssertEqual(conversation.lastMessageNature?.callSummary?.durationSec, 252)
        XCTAssertEqual(conversation.lastReaction?.reactorName, "Alice")
        XCTAssertEqual(conversation.activeCall?.kind, "video")
    }

    // MARK: - Cache disque

    func test_rowWithContractFields_survivesTheCacheRoundTrip() throws {
        var conversation = row(lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000))
        conversation.lastMessageNature = LastMessageNature(
            messageType: "image", effectFlags: 4, isEncrypted: true,
            systemEvent: LastMessageSystemEvent(key: "system.generic", params: ["n": .number(2)]),
            attachmentSummary: LastMessageAttachmentSummary(count: 3, kinds: ["image": 3], totalSize: 1_468_006)
        )
        conversation.activeCall = ConversationActiveCall(
            id: "call-1", kind: "audio", participantCount: 2, startedAt: Date(timeIntervalSince1970: 1_700_000_100))

        let data = try JSONEncoder().encode(conversation)
        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: data)

        XCTAssertEqual(decoded.lastMessageNature, conversation.lastMessageNature)
        XCTAssertEqual(decoded.activeCall, conversation.activeCall)
    }

    func test_renderFingerprint_movesWhenACallStarts() {
        let quiet = row(lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000))
        var ringing = quiet
        ringing.activeCall = ConversationActiveCall(
            id: "call-1", kind: "audio", participantCount: 1, startedAt: Date(timeIntervalSince1970: 1_700_000_100))

        XCTAssertNotEqual(quiet.renderFingerprint, ringing.renderFingerprint,
                          "une ligne Equatable doit se redessiner quand un appel commence")
    }

    // MARK: - message:new et envoi : la nature dérivée du message

    func test_facetOfAFullMessage_derivesItsNature() {
        var message = MeeshyMessage(
            id: "m-1", conversationId: "conv-1", content: "regarde",
            messageType: .image,
            attachments: [
                MeeshyMessageAttachment(id: "a", mimeType: "image/jpeg", fileSize: 1000),
                MeeshyMessageAttachment(id: "b", mimeType: "video/mp4", fileSize: 0),
            ]
        )
        message.forwardedFromId = "m-origin"

        let nature = LastMessageFacet(message: message, preview: message.content, youLabel: "Vous").nature

        XCTAssertEqual(nature?.messageType, "image")
        XCTAssertEqual(nature?.isForwarded, true)
        XCTAssertEqual(nature?.attachmentSummary?.count, 2)
        XCTAssertEqual(nature?.attachmentSummary?.kinds, ["image": 1, "video": 1])
        XCTAssertEqual(nature?.attachmentSummary?.totalSize, 1000, "une taille inconnue ne s'additionne pas")
    }

    func test_adoptingAnotherMessage_forgetsTheNatureOfThePrevious() {
        var conversation = row(lastMessageAt: Date())
        conversation.lastMessageNature = LastMessageNature(messageType: "audio", isForwarded: true)

        conversation.adoptLastMessage(id: "m-next")

        XCTAssertNil(conversation.lastMessageNature)
    }
}
