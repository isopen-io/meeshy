import Foundation
import Testing
@testable import MeeshySDK

/// #11379 — dans une conversation chiffrée de bout en bout, rien ne part en
/// clair : la loi dit ce qui a le droit d'être scellé, et refuse le reste.
struct EndToEndSendGateTests {

    private func makeOutgoing(
        content: String = "Salut",
        relation: MessageRelation = .none,
        attachmentIds: [String]? = nil,
        location: SharedPlace? = nil,
        sticker: MessageSticker? = nil
    ) -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID("c1"),
            content: content,
            relation: relation,
            attachments: OutgoingAttachments(ids: attachmentIds, previews: nil),
            location: location,
            sticker: sticker
        )
    }

    // MARK: - Le régime

    @Test func requiresSeal_e2eeInAnyCase_isTrue() {
        #expect(EndToEndSendGate.requiresSeal(conversationEncryptionModes: ["e2ee"]))
        #expect(EndToEndSendGate.requiresSeal(conversationEncryptionModes: ["E2EE"]))
        #expect(EndToEndSendGate.requiresSeal(conversationEncryptionModes: [" e2ee "]))
    }

    @Test func requiresSeal_serverReadableModes_isFalse() {
        #expect(!EndToEndSendGate.requiresSeal(conversationEncryptionModes: [nil]))
        #expect(!EndToEndSendGate.requiresSeal(conversationEncryptionModes: [""]))
        #expect(!EndToEndSendGate.requiresSeal(conversationEncryptionModes: ["server"]))
        #expect(!EndToEndSendGate.requiresSeal(conversationEncryptionModes: ["hybrid"]))
        #expect(!EndToEndSendGate.requiresSeal(conversationEncryptionModes: []))
    }

    @Test func requiresSeal_unknownMode_failsClosed() {
        #expect(EndToEndSendGate.requiresSeal(conversationEncryptionModes: ["signal-v2"]))
    }

    @Test func requiresSeal_oneSourceSaysE2ee_wins() {
        #expect(EndToEndSendGate.requiresSeal(conversationEncryptionModes: [nil, "e2ee"]))
        #expect(EndToEndSendGate.requiresSeal(conversationEncryptionModes: ["e2ee", nil]))
        #expect(EndToEndSendGate.requiresSeal(conversationEncryptionModes: ["server", "e2ee"]))
    }

    // MARK: - Ce qui se scelle

    @Test func refusal_plainTextToKnownPeer_isNil() {
        #expect(EndToEndSendGate.refusal(for: makeOutgoing(), isDirect: true, peerUserId: "peer") == nil)
    }

    @Test func refusal_replyWithoutAttachmentAnchor_isNil() {
        let reply = makeOutgoing(relation: .reply(to: MessageID("m1"), citing: nil))
        #expect(EndToEndSendGate.refusal(for: reply, isDirect: true, peerUserId: "peer") == nil)
    }

    @Test func refusal_groupOrUnknownPeer_isRecipientUnsealable() {
        #expect(EndToEndSendGate.refusal(for: makeOutgoing(), isDirect: false, peerUserId: "peer") == .recipientUnsealable)
        #expect(EndToEndSendGate.refusal(for: makeOutgoing(), isDirect: true, peerUserId: nil) == .recipientUnsealable)
        #expect(EndToEndSendGate.refusal(for: makeOutgoing(), isDirect: true, peerUserId: "") == .recipientUnsealable)
    }

    @Test func refusal_attachments_isContentUnsealable() {
        let outgoing = makeOutgoing(attachmentIds: ["a1"])
        #expect(EndToEndSendGate.refusal(for: outgoing, isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    // MARK: - Pièces chiffrées sur l'appareil (#10789)

    private static func pointer(_ id: String, scheme: String = E2EEAttachmentPointer.clientV1, thumbnail: String? = nil) -> E2EEAttachmentPointer {
        E2EEAttachmentPointer(
            id: id, scheme: scheme, key: Data(repeating: 1, count: 64), digest: Data(repeating: 2, count: 32),
            size: 10, contentType: "image/jpeg", fileName: "a.jpg", kind: .image,
            thumbnail: thumbnail.map { .init(id: $0, key: Data(repeating: 3, count: 64), digest: Data(repeating: 4, count: 32), size: 5, contentType: "image/jpeg") }
        )
    }

    private func sealedOutgoing(content: String = "", ids: [String], pointers: [E2EEAttachmentPointer]) -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID("c1"), content: content, relation: .none,
            attachments: OutgoingAttachments(ids: ids, previews: nil, sealed: pointers)
        )
    }

    @Test func refusal_sealedPieces_evenWithoutText_isNil() {
        let outgoing = sealedOutgoing(ids: ["b1", "t1"], pointers: [Self.pointer("b1", thumbnail: "t1")])
        #expect(EndToEndSendGate.refusal(for: outgoing, isDirect: true, peerUserId: "peer") == nil)
    }

    @Test func refusal_aPieceNotCoveredByAPointer_isContentUnsealable() {
        let outgoing = sealedOutgoing(ids: ["b1", "plain"], pointers: [Self.pointer("b1")])
        #expect(EndToEndSendGate.refusal(for: outgoing, isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    @Test func refusal_aPointerWhoseBlobIsNotSent_isContentUnsealable() {
        let outgoing = sealedOutgoing(ids: ["b1"], pointers: [Self.pointer("b1", thumbnail: "t1")])
        #expect(EndToEndSendGate.refusal(for: outgoing, isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    @Test func refusal_aPointerOfAnUnknownScheme_isContentUnsealable() {
        let outgoing = sealedOutgoing(ids: ["b1"], pointers: [Self.pointer("b1", scheme: "client-v9")])
        #expect(EndToEndSendGate.refusal(for: outgoing, isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    @Test func refusal_sealedPiecesNextToALocation_isStillContentUnsealable() {
        let outgoing = OutgoingMessage(
            conversationId: ConversationID("c1"), content: "", relation: .none,
            attachments: OutgoingAttachments(ids: ["b1"], previews: nil, sealed: [Self.pointer("b1")]),
            location: SharedPlace(latitude: 1, longitude: 2)
        )
        #expect(EndToEndSendGate.refusal(for: outgoing, isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    @Test func refusal_location_isContentUnsealable() {
        let outgoing = makeOutgoing(location: SharedPlace(latitude: 48.85, longitude: 2.35))
        #expect(EndToEndSendGate.refusal(for: outgoing, isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    @Test func refusal_sticker_isContentUnsealable() {
        let outgoing = makeOutgoing(sticker: MessageSticker())
        #expect(EndToEndSendGate.refusal(for: outgoing, isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    @Test func refusal_quotedAttachmentAnchor_isContentUnsealable() {
        let reply = makeOutgoing(relation: .reply(to: MessageID("m1"), citing: QuotedAttachmentSend(attachmentId: "a3")))
        #expect(EndToEndSendGate.refusal(for: reply, isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    @Test func refusal_forward_isContentUnsealable() {
        let forward = makeOutgoing(relation: .forward(of: MessageID("m1"), from: nil))
        #expect(EndToEndSendGate.refusal(for: forward, isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    @Test func refusal_blankText_isContentUnsealable() {
        #expect(EndToEndSendGate.refusal(for: makeOutgoing(content: "   "), isDirect: true, peerUserId: "peer") == .contentUnsealable)
    }

    @Test func endToEndFailure_isNeverAccepted() {
        let result: Result<SentMessageReceipt, SendFailure> = .failure(.endToEndUnsealed(.sessionUnavailable))
        #expect(!result.isAccepted)
        #expect(SendFailure.endToEndUnsealed(.sessionUnavailable) != .endToEndUnsealed(.outboxUnsealable))
    }

    // MARK: - Le refus du SERVEUR (#11216)

    private func plaintextRefusal(status: Int = 400) -> MeeshyError {
        .rejected(APIRejection(statusCode: status, code: EndToEndSendGate.serverPlaintextRefusalCode, message: "refusé"))
    }

    @Test func serverPlaintextRefusal_isRecognisedByItsStableCode() {
        #expect(EndToEndSendGate.serverPlaintextRefusalCode == "E2EE_PLAINTEXT_REFUSED")
        #expect(EndToEndSendGate.isServerPlaintextRefusal(plaintextRefusal()))
    }

    @Test func serverPlaintextRefusal_otherRefusals_areNot() {
        #expect(!EndToEndSendGate.isServerPlaintextRefusal(MeeshyError.server(statusCode: 400, message: "Validation error")))
        #expect(!EndToEndSendGate.isServerPlaintextRefusal(MeeshyError.rejected(APIRejection(statusCode: 400, code: "VALIDATION_ERROR", message: "x"))))
        #expect(!EndToEndSendGate.isServerPlaintextRefusal(URLError(.timedOut)))
    }

    @Test func serverEnvelopeRefusal_definitiveClientErrors_only() {
        #expect(EndToEndSendGate.isServerEnvelopeRefusal(MeeshyError.server(statusCode: 400, message: "Validation error")))
        #expect(EndToEndSendGate.isServerEnvelopeRefusal(MeeshyError.server(statusCode: 422, message: "x")))
        #expect(EndToEndSendGate.isServerEnvelopeRefusal(plaintextRefusal()))
        #expect(!EndToEndSendGate.isServerEnvelopeRefusal(MeeshyError.server(statusCode: 408, message: "x")))
        #expect(!EndToEndSendGate.isServerEnvelopeRefusal(MeeshyError.server(statusCode: 429, message: "x")))
        #expect(!EndToEndSendGate.isServerEnvelopeRefusal(MeeshyError.server(statusCode: 503, message: "x")))
        #expect(!EndToEndSendGate.isServerEnvelopeRefusal(MeeshyError.server(statusCode: 0, message: "x")))
        #expect(!EndToEndSendGate.isServerEnvelopeRefusal(URLError(.notConnectedToInternet)))
    }

    @Test func serverPlaintextRefusal_isPermanentForTheOutbox() {
        #expect(OutboxFlusher.isPermanentServerRejection(plaintextRefusal()))
    }
}
