import XCTest
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Ce que la couche appareil d'un message hybride dit du texte servi** (#14369).
///
/// Le clair ouvert depuis l'enveloppe se compare au texte que la passerelle a
/// servi, et seulement s'il est à SA place : un serveur qui altère le texte est
/// démasqué, un serveur qui déplace une enveloppe n'obtient aucun verdict.
@MainActor
final class HybridThreadIntegrityTests: XCTestCase {
    private let conversationId = "00000000000000000000cd01"
    private let peer = "00000000000000000000cd77"

    private func served(_ text: String, id: String = "m1", isEdited: Bool = false, isMe: Bool = false, mode: String? = "hybrid") -> MeeshyMessage {
        var message = MeeshyMessage(
            id: id, clientMessageId: "cid_1", conversationId: conversationId, senderId: "p1",
            content: text, isEncrypted: false, encryptionMode: mode, senderUserId: isMe ? "me" : peer, isMe: isMe
        )
        message.isEdited = isEdited
        return message
    }

    private func sealed(_ text: String, conversation: String? = nil, clientMessageId: String? = "cid_1") -> E2EEPlaintextEntry {
        .readable(
            E2EEContent(text: text, language: "fr", replyTo: nil, conversationId: conversation ?? conversationId, clientMessageId: clientMessageId, sentAt: Date()),
            senderUserId: peer
        )
    }

    func test_sameTextServedAndSealed_isVerified() {
        XCTAssertEqual(HybridThreadIntegrity.verdict(for: served("Rendez-vous à 18 h"), entry: sealed("Rendez-vous à 18 h"), conversationId: conversationId), .verified)
    }

    func test_alteredServedText_isAMismatch_carryingTheAuthorsText() {
        XCTAssertEqual(
            HybridThreadIntegrity.verdict(for: served("Rendez-vous à 20 h"), entry: sealed("Rendez-vous à 18 h"), conversationId: conversationId),
            .mismatch(deviceText: "Rendez-vous à 18 h")
        )
    }

    func test_anEnvelopeMovedToAnotherConversation_givesNoVerdict() {
        XCTAssertNil(HybridThreadIntegrity.verdict(for: served("Salut"), entry: sealed("Salut", conversation: "other"), conversationId: conversationId))
    }

    func test_anEnvelopeMovedToAnotherMessage_givesNoVerdict() {
        XCTAssertNil(HybridThreadIntegrity.verdict(for: served("Salut"), entry: sealed("Salut", clientMessageId: "cid_2"), conversationId: conversationId))
    }

    func test_noEnvelopeOpened_givesNoVerdict() {
        XCTAssertNil(HybridThreadIntegrity.verdict(for: served("Salut"), entry: nil, conversationId: conversationId))
    }

    func test_anEditedMessage_isUnverifiable_neverAMismatch() {
        XCTAssertEqual(HybridThreadIntegrity.verdict(for: served("Rendez-vous à 20 h", isEdited: true), entry: sealed("Rendez-vous à 18 h"), conversationId: conversationId), .unverifiable)
    }

    func test_onlyHybridMessagesOfAnotherMember_awaitAVerdict() {
        XCTAssertTrue(HybridThreadIntegrity.awaitsVerdict(served("Salut")))
        XCTAssertFalse(HybridThreadIntegrity.awaitsVerdict(served("Salut", isMe: true)))
        XCTAssertFalse(HybridThreadIntegrity.awaitsVerdict(served("Salut", mode: "server")))
        XCTAssertFalse(HybridThreadIntegrity.awaitsVerdict(served("Salut", mode: "e2ee")))
    }

    func test_resolveThenApply_showsTheAuthorsText_andFlagsTheMismatch() async {
        let e2ee = MockEndToEndMessaging()
        e2ee.store(sealed("Rendez-vous à 18 h"), for: "m1")
        let integrity = HybridThreadIntegrity()
        var message = served("Rendez-vous à 20 h")

        await integrity.resolve([message], from: e2ee, conversationId: conversationId, account: "me")
        integrity.apply(to: &message)

        XCTAssertEqual(message.content, "Rendez-vous à 18 h")
        XCTAssertEqual(message.deviceLayerIntegrity, .mismatch(deviceText: "Rendez-vous à 18 h"))
        XCTAssertFalse(message.isContentDecryptedOnDevice, "un hybride n'est jamais pris pour un message de bout en bout")
    }

    func test_resolveThenApply_verified_keepsTheServedText() async {
        let e2ee = MockEndToEndMessaging()
        e2ee.store(sealed("Salut"), for: "m1")
        let integrity = HybridThreadIntegrity()
        var message = served("Salut")

        await integrity.resolve([message], from: e2ee, conversationId: conversationId, account: "me")
        integrity.apply(to: &message)

        XCTAssertEqual(message.content, "Salut")
        XCTAssertEqual(message.deviceLayerIntegrity, .verified)
    }

    func test_aMessageWithoutDeviceLayer_claimsNothing() async {
        let integrity = HybridThreadIntegrity()
        var message = served("Salut")

        await integrity.resolve([message], from: MockEndToEndMessaging(), conversationId: conversationId, account: "me")
        integrity.apply(to: &message)

        XCTAssertNil(message.deviceLayerIntegrity)
        XCTAssertTrue(integrity.verdicts.isEmpty)
    }

    func test_aMessageEditedAfterItsVerdict_losesItsSeal() async {
        let e2ee = MockEndToEndMessaging()
        e2ee.store(sealed("Salut"), for: "m1")
        let integrity = HybridThreadIntegrity()
        await integrity.resolve([served("Salut")], from: e2ee, conversationId: conversationId, account: "me")
        var edited = served("Salut, finalement non", isEdited: true)

        integrity.apply(to: &edited)

        XCTAssertEqual(edited.deviceLayerIntegrity, .unverifiable)
        XCTAssertEqual(edited.content, "Salut, finalement non", "l'édition servie s'affiche, sans sceau")
    }

    func test_aMessageReadOnce_isNotReadAgain_untilAnEnvelopeOpens() async {
        let integrity = HybridThreadIntegrity()
        let message = served("Salut")
        XCTAssertTrue(integrity.needsRead(message))

        await integrity.resolve([message], from: MockEndToEndMessaging(), conversationId: conversationId, account: "me")
        XCTAssertFalse(integrity.needsRead(message), "une relecture du magasin ne repasse pas par le coffre")

        integrity.reopen()
        XCTAssertTrue(integrity.needsRead(message), "une enveloppe ouverte fait tout relire")
    }
}
