import XCTest
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Ce que la couche appareil d'un message hybride dit du texte servi** (#14369).
///
/// Le clair ouvert depuis l'enveloppe se compare au texte que la passerelle a
/// servi, et seulement s'il est à SA place et rattaché à CE message
/// (identifiant client des deux côtés, instant scellé dans la fenêtre). Un
/// écart ne remplace JAMAIS le texte servi (audit adversarial : un auteur
/// pourrait sinon envoyer un texte bénin au serveur et un autre dans ses
/// enveloppes) ; une édition servie sans preuve de l'auteur est un écart, pas
/// un silence.
@MainActor
final class HybridThreadIntegrityTests: XCTestCase {
    private let conversationId = "00000000000000000000cd01"
    private let peer = "00000000000000000000cd77"
    private let servedAt = Date(timeIntervalSince1970: 1_790_000_000)

    private func served(
        _ text: String,
        id: String = "m1",
        clientMessageId: String? = "cid_1",
        servedClientMessageId: String? = nil,
        isEdited: Bool = false,
        isMe: Bool = false,
        mode: String? = "hybrid"
    ) -> MeeshyMessage {
        var message = MeeshyMessage(
            id: id, clientMessageId: clientMessageId, conversationId: conversationId, senderId: "p1",
            content: text, isEncrypted: false, encryptionMode: mode, createdAt: servedAt,
            senderUserId: isMe ? "me" : peer, isMe: isMe
        )
        message.isEdited = isEdited
        message.servedClientMessageId = servedClientMessageId
        return message
    }

    private func sealed(
        _ text: String,
        conversation: String? = nil,
        clientMessageId: String? = "cid_1",
        sealedAt: Date? = nil
    ) -> E2EEPlaintextEntry {
        .readable(
            E2EEContent(
                text: text, language: "fr", replyTo: nil, conversationId: conversation ?? conversationId,
                clientMessageId: clientMessageId, sentAt: sealedAt ?? servedAt.addingTimeInterval(-2)
            ),
            senderUserId: peer
        )
    }

    private func verdict(_ message: MeeshyMessage, _ entry: E2EEPlaintextEntry?) -> HybridDeviceLayerIntegrity? {
        HybridThreadIntegrity.verdict(for: message, entry: entry, conversationId: conversationId)
    }

    // MARK: - Verdicts

    func test_sameTextServedAndSealed_isVerified() {
        XCTAssertEqual(verdict(served("Rendez-vous à 18 h"), sealed("Rendez-vous à 18 h")), .verified)
    }

    func test_alteredServedText_isAMismatch_carryingTheDeviceText() {
        XCTAssertEqual(
            verdict(served("Rendez-vous à 20 h"), sealed("Rendez-vous à 18 h")),
            .mismatch(deviceText: "Rendez-vous à 18 h", servedAsEdited: false)
        )
    }

    func test_anEnvelopeMovedToAnotherConversation_givesNoVerdict() {
        XCTAssertNil(verdict(served("Salut"), sealed("Salut", conversation: "other")))
    }

    func test_anEnvelopeMovedToAnotherMessage_givesNoVerdict() {
        XCTAssertNil(verdict(served("Salut"), sealed("Salut", clientMessageId: "cid_2")))
    }

    func test_noEnvelopeOpened_givesNoVerdict() {
        XCTAssertNil(verdict(served("Salut"), nil))
    }

    // MARK: - Rattachement (identifiant client des deux côtés, fenêtre de 10 min)

    func test_aSealedLayerWithoutClientId_isUnverifiable_neverVerified() {
        XCTAssertEqual(verdict(served("Salut"), sealed("Salut", clientMessageId: nil)), .unverifiable)
    }

    func test_aServedMessageWithoutClientId_isUnverifiable_neverVerified() {
        XCTAssertEqual(verdict(served("Salut", clientMessageId: nil), sealed("Salut")), .unverifiable)
    }

    func test_aStoreRow_bindsThroughTheServedClientIdColumn() {
        XCTAssertEqual(verdict(served("Salut", clientMessageId: nil, servedClientMessageId: "cid_1"), sealed("Salut")), .verified)
    }

    func test_aSealedInstantOutsideTheWindow_isUnverifiable() {
        let replayed = sealed("Salut", sealedAt: servedAt.addingTimeInterval(-(HybridDeviceLayer.sentAtWindow + 60)))
        XCTAssertEqual(verdict(served("Salut"), replayed), .unverifiable)
    }

    func test_aSealedInstantInsideTheWindow_isJudged() {
        let late = sealed("Salut", sealedAt: servedAt.addingTimeInterval(-(HybridDeviceLayer.sentAtWindow - 60)))
        XCTAssertEqual(verdict(served("Salut"), late), .verified)
    }

    // MARK: - Édition : un texte modifié sans preuve de l'auteur n'est jamais tu

    func test_anEditedMessageThatDiffers_isAMismatch_markedAsEdited() {
        XCTAssertEqual(
            verdict(served("Rendez-vous à 20 h", isEdited: true), sealed("Rendez-vous à 18 h")),
            .mismatch(deviceText: "Rendez-vous à 18 h", servedAsEdited: true)
        )
    }

    func test_onlyHybridMessagesOfAnotherMember_awaitAVerdict() {
        XCTAssertTrue(HybridThreadIntegrity.awaitsVerdict(served("Salut")))
        XCTAssertFalse(HybridThreadIntegrity.awaitsVerdict(served("Salut", isMe: true)))
        XCTAssertFalse(HybridThreadIntegrity.awaitsVerdict(served("Salut", mode: "server")))
        XCTAssertFalse(HybridThreadIntegrity.awaitsVerdict(served("Salut", mode: "e2ee")))
    }

    // MARK: - Pose sur la ligne : le texte servi n'est jamais remplacé

    func test_resolveThenApply_keepsTheServedText_andFlagsTheMismatch() async {
        let e2ee = MockEndToEndMessaging()
        e2ee.store(sealed("Texte abusif"), for: "m1")
        let integrity = HybridThreadIntegrity()
        var message = served("Texte bénin")

        await integrity.resolve([message], from: e2ee, conversationId: conversationId, account: "me")
        integrity.apply(to: &message)

        XCTAssertEqual(message.content, "Texte bénin", "le texte servi reste celui que la modération et le signalement voient")
        XCTAssertEqual(message.deviceLayerIntegrity, .mismatch(deviceText: "Texte abusif", servedAsEdited: false))
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
        XCTAssertTrue(integrity.layers.isEmpty)
    }

    func test_aMessageEditedAfterItsVerdict_isRejudged_asAnEditedMismatch() async {
        let e2ee = MockEndToEndMessaging()
        e2ee.store(sealed("Salut"), for: "m1")
        let integrity = HybridThreadIntegrity()
        await integrity.resolve([served("Salut")], from: e2ee, conversationId: conversationId, account: "me")
        var edited = served("Salut, finalement non", isEdited: true)

        integrity.apply(to: &edited)

        XCTAssertEqual(edited.deviceLayerIntegrity, .mismatch(deviceText: "Salut", servedAsEdited: true))
        XCTAssertEqual(edited.content, "Salut, finalement non", "l'édition servie s'affiche ; l'original se dévoile à la demande")
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

    // MARK: - Signalement : les deux textes partent

    func test_reportReason_onMismatch_carriesBothTexts() throws {
        let reason = try XCTUnwrap(HybridThreadIntegrity.reportReason(
            "harcèlement", served: "Texte bénin",
            integrity: .mismatch(deviceText: "Texte abusif", servedAsEdited: false)
        ))
        XCTAssertTrue(reason.contains("harcèlement"))
        XCTAssertTrue(reason.contains("Texte bénin"))
        XCTAssertTrue(reason.contains("Texte abusif"))
    }

    func test_reportingAThreadMessageInMismatch_sendsTheServedAndTheDeviceText() async throws {
        let e2ee = MockEndToEndMessaging()
        e2ee.store(sealed("Texte abusif"), for: "m1")
        let integrity = HybridThreadIntegrity()
        let message = served("Texte bénin")
        await integrity.resolve([message], from: e2ee, conversationId: conversationId, account: "me")

        let reason = try XCTUnwrap(integrity.reportReason("abus", for: "m1", in: [message]))

        XCTAssertTrue(reason.contains("Texte bénin") && reason.contains("Texte abusif"))
        XCTAssertEqual(integrity.reportReason("abus", for: "inconnu", in: [message]), "abus")
    }

    func test_reportReason_withoutMismatch_isUnchanged() {
        XCTAssertEqual(HybridThreadIntegrity.reportReason("spam", served: "x", integrity: .verified), "spam")
        XCTAssertNil(HybridThreadIntegrity.reportReason(nil, served: "x", integrity: nil))
    }

    func test_reportReason_staysWithinTheRouteLimit() throws {
        let long = String(repeating: "é😀", count: 3_000)
        let reason = try XCTUnwrap(HybridThreadIntegrity.reportReason(long, served: long, integrity: .mismatch(deviceText: long, servedAsEdited: false)))
        XCTAssertLessThanOrEqual(reason.utf16.count, HybridThreadIntegrity.reportLimit, "la route mesure en UTF-16")
        XCTAssertTrue(reason.contains("device: "), "le texte de l'appareil n'est jamais rogné hors du motif")
    }

    // MARK: - Le sceau ne couvre que l'ORIGINAL (jamais une traduction du serveur)

    private func english(for message: MeeshyMessage) -> MessageTranslation {
        MessageTranslation(
            id: "t1", messageId: message.id, sourceLanguage: "fr", targetLanguage: "en",
            translatedContent: "Meeting at 6 pm", translationModel: "nllb", confidenceScore: nil
        )
    }

    private func bubble(_ integrity: HybridDeviceLayerIntegrity, showing activeLanguage: String?) -> BubbleContent {
        var message = served("Rendez-vous à 18 h")
        message.deviceLayerIntegrity = integrity
        let translation = english(for: message)
        return BubbleContent(
            message: message, translations: [translation], preferredTranslation: translation,
            activeDisplayLangCode: activeLanguage, currentUserId: "me", timeString: "18:00"
        )
    }

    func test_bubble_showingTheServerTranslation_carriesNoSeal() {
        let content = bubble(.verified, showing: nil)
        XCTAssertEqual(content.text?.raw, "Meeting at 6 pm", "le Prisme montre la traduction par défaut")
        XCTAssertNil(content.deviceLayerIntegrity, "aucun sceau « vérifié » à côté d'un texte produit par le serveur")
        XCTAssertNil(BubbleDeviceLayerMark.spokenLabel(for: content.deviceLayerIntegrity))
    }

    func test_bubble_showingTheOriginal_carriesTheSeal_namingTheOriginal() throws {
        let content = bubble(.verified, showing: "fr")
        XCTAssertEqual(content.text?.raw, "Rendez-vous à 18 h")
        XCTAssertEqual(content.deviceLayerIntegrity, .verified)
        XCTAssertEqual(BubbleDeviceLayerMark.glyph(for: .verified), "checkmark.seal")
        let spoken = try XCTUnwrap(BubbleDeviceLayerMark.spokenLabel(for: content.deviceLayerIntegrity))
        XCTAssertTrue(spoken.localizedCaseInsensitiveContains("original"), "VoiceOver nomme ce qui est vérifié : « \(spoken) »")
    }

    func test_bubble_aMismatch_isSaidEvenOverATranslation_andKeepsTheTranslations() {
        let content = bubble(.mismatch(deviceText: "Autre texte", servedAsEdited: false), showing: nil)
        XCTAssertEqual(content.text?.raw, "Meeting at 6 pm", "le texte servi et ses traductions restent")
        XCTAssertEqual(content.deviceLayerIntegrity, .mismatch(deviceText: "Autre texte", servedAsEdited: false))
        XCTAssertNotNil(BubbleDeviceLayerMark.glyph(for: .mismatch(deviceText: "Autre texte", servedAsEdited: false)))
    }

    func test_mark_editedMismatch_andServedMismatch_speakDifferently_withoutBlamingAnyone() throws {
        let served = try XCTUnwrap(BubbleDeviceLayerMark.spokenLabel(for: .mismatch(deviceText: "x", servedAsEdited: false)))
        let edited = try XCTUnwrap(BubbleDeviceLayerMark.spokenLabel(for: .mismatch(deviceText: "x", servedAsEdited: true)))
        XCTAssertNotEqual(served, edited)
        for label in [served, edited] {
            XCTAssertFalse(label.localizedCaseInsensitiveContains("serveur") || label.localizedCaseInsensitiveContains("server"), "aucune faute attribuée : « \(label) »")
        }
        XCTAssertNil(BubbleDeviceLayerMark.glyph(for: .unverifiable))
    }
}
