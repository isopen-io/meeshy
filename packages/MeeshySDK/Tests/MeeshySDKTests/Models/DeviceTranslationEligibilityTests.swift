import Foundation
import XCTest
@testable import MeeshySDK

/// #9899 — ce que le fil confie à l'appareil, et ce qu'il en fait. Miroir de
/// `offeredMessagesOf` (`apps/web/src/lib/device-translation/offer.test.ts`),
/// complété du chiffrement de bout en bout : fail-closed, jamais partagé.
final class DeviceTranslationEligibilityTests: XCTestCase {

    private func makeMessage(
        content: String = "habari yako",
        originalLanguage: String = "sw",
        source: MeeshyMessage.MessageSource = .user,
        effects: MessageEffects = .none,
        expiresAt: Date? = nil,
        deletedAt: Date? = nil,
        isEncrypted: Bool = false,
        encryptionMode: String? = nil,
        isMe: Bool = false,
        attachments: [MeeshyMessageAttachment] = [],
        decryptedOnDevice: Bool = false
    ) -> MeeshyMessage {
        var message = MeeshyMessage(
            id: "64f0c0ffee0000000000a001", conversationId: "64f0c0ffee0000000000c0de", senderId: "u-other",
            content: content, originalLanguage: originalLanguage, messageSource: source,
            deletedAt: deletedAt, expiresAt: expiresAt, effects: effects,
            isEncrypted: isEncrypted, encryptionMode: encryptionMode,
            attachments: attachments, isMe: isMe
        )
        if decryptedOnDevice { message.adoptDecryptedContent(content) }
        return message
    }

    /// Le clair que CET appareil a déchiffré : seul porteur d'un texte de bout en bout.
    private func decrypted(
        content: String = "habari yako", isEncrypted: Bool = false, encryptionMode: String? = nil
    ) -> MeeshyMessage {
        makeMessage(content: content, isEncrypted: isEncrypted, encryptionMode: encryptionMode, decryptedOnDevice: true)
    }

    private func disposition(of message: MeeshyMessage, conversationMode: String? = nil) -> DeviceTranslationDisposition {
        DeviceTranslationEligibility.disposition(of: message, conversationEncryptionMode: conversationMode)
    }

    // MARK: - Ce qui est confié

    func test_disposition_aReceivedPlainMessage_isShareable() {
        XCTAssertEqual(disposition(of: makeMessage()), .shareable)
    }

    func test_disposition_aServerOrHybridConversation_isStillShareable() {
        XCTAssertEqual(disposition(of: makeMessage(), conversationMode: "server"), .shareable)
        XCTAssertEqual(disposition(of: makeMessage(), conversationMode: "hybrid"), .shareable)
        XCTAssertEqual(disposition(of: makeMessage(isEncrypted: true, encryptionMode: "server")), .shareable)
    }

    func test_disposition_myOwnMessages_areSkipped() {
        XCTAssertEqual(disposition(of: makeMessage(isMe: true)), .skip)
    }

    func test_disposition_viewOnceBlurredAndEphemeralMessages_areSkipped() {
        let protectedMessages = [
            makeMessage(effects: MessageEffects(flags: [.viewOnce])),
            makeMessage(effects: MessageEffects(flags: [.blurred])),
            makeMessage(effects: MessageEffects(flags: [.ephemeral])),
            makeMessage(effects: MessageEffects(flags: [.ephemeral, .ephemeralAfterRead])),
            makeMessage(effects: MessageEffects(ephemeralDuration: 30)),
            makeMessage(expiresAt: Date(timeIntervalSince1970: 1_800_000_000)),
        ]

        for message in protectedMessages {
            XCTAssertEqual(disposition(of: message), .skip)
        }
    }

    func test_disposition_aCaptionCarriedByAProtectedAttachment_isSkipped() {
        let protectedAttachments = [
            MeeshyMessageAttachment(isViewOnce: true),
            MeeshyMessageAttachment(effectFlags: MessageEffectFlags.viewOnce.rawValue),
            MeeshyMessageAttachment(effectFlags: MessageEffectFlags.ephemeral.rawValue),
            MeeshyMessageAttachment(effectFlags: MessageEffectFlags.ephemeralAfterRead.rawValue),
        ]

        for attachment in protectedAttachments {
            XCTAssertEqual(disposition(of: makeMessage(attachments: [attachment])), .skip)
        }
    }

    func test_disposition_aCaptionCarriedByAnOrdinaryAttachment_isShareable() {
        XCTAssertEqual(disposition(of: makeMessage(attachments: [MeeshyMessageAttachment()])), .shareable)
    }

    func test_disposition_systemNoticesDeletedAndEmptyMessages_areSkipped() {
        XCTAssertEqual(disposition(of: makeMessage(source: .system)), .skip)
        XCTAssertEqual(disposition(of: makeMessage(deletedAt: Date(timeIntervalSince1970: 1_800_000_000))), .skip)
        XCTAssertEqual(disposition(of: makeMessage(content: "")), .skip)
        XCTAssertEqual(disposition(of: makeMessage(content: " \n ")), .skip)
    }

    func test_disposition_withoutAnOriginalLanguage_isSkipped() {
        XCTAssertEqual(disposition(of: makeMessage(originalLanguage: "")), .skip)
        XCTAssertEqual(disposition(of: makeMessage(originalLanguage: "  ")), .skip)
    }

    // MARK: - Le chiffrement de bout en bout

    func test_disposition_anEndToEndMessageOnceDecrypted_staysOnTheDevice() {
        XCTAssertEqual(disposition(of: decrypted(isEncrypted: true, encryptionMode: "e2ee")), .ephemeral)
        XCTAssertEqual(disposition(of: decrypted(isEncrypted: true, encryptionMode: "E2EE")), .ephemeral)
        XCTAssertEqual(disposition(of: decrypted(encryptionMode: "e2ee")), .ephemeral)
    }

    func test_disposition_anEndToEndConversation_staysOnTheDeviceForEveryDecryptedMessage() {
        XCTAssertEqual(disposition(of: decrypted(), conversationMode: "e2ee"), .ephemeral)
        XCTAssertEqual(disposition(of: decrypted(), conversationMode: "E2EE"), .ephemeral)
    }

    func test_disposition_anEncryptedMessageThatAnnouncesNoMode_isTreatedAsEndToEnd() {
        XCTAssertEqual(disposition(of: decrypted(isEncrypted: true)), .ephemeral)
        XCTAssertEqual(disposition(of: decrypted(isEncrypted: true, encryptionMode: " ")), .ephemeral)
    }

    func test_disposition_anEndToEndMessageStillInItsCiphertext_isSkipped() {
        let ciphertext = Data((0..<40).map(UInt8.init)).base64EncodedString()

        XCTAssertEqual(disposition(of: makeMessage(content: ciphertext, isEncrypted: true, encryptionMode: "e2ee")), .skip)
        XCTAssertEqual(disposition(of: makeMessage(content: ciphertext), conversationMode: "e2ee"), .skip)
    }

    // MARK: - Le clair se reconnaît par sa PROVENANCE, jamais par sa forme (#11402)

    /// Un clair réel peut être du base64 valide : déchiffré sur l'appareil, il
    /// se traduit — l'ancienne heuristique le prenait pour un cryptogramme.
    func test_disposition_aBase64LookingClear_decryptedOnTheDevice_isTranslated() {
        let base64Clear = Data(repeating: 0x78, count: 40).base64EncodedString()

        XCTAssertEqual(disposition(of: decrypted(content: base64Clear, isEncrypted: true, encryptionMode: "e2ee")), .ephemeral)
    }

    /// Un texte que la passerelle forge dans une conversation chiffrée n'a
    /// aucune provenance : l'appareil ne le traduit pas (fail-closed, #9229).
    func test_disposition_aForgedClearWithoutProvenance_isNeverTranslated() {
        XCTAssertEqual(disposition(of: makeMessage(content: "Texte forgé par le serveur"), conversationMode: "e2ee"), .skip)
        XCTAssertEqual(disposition(of: makeMessage(content: "Texte forgé", isEncrypted: true, encryptionMode: "e2ee")), .skip)
    }

    /// Le texte réécrit APRÈS le déchiffrement (le REST rend le cryptogramme,
    /// un tiers réécrit la ligne) n'est plus le clair déchiffré.
    func test_disposition_aContentRewrittenAfterDecryption_isNeverTranslated() {
        var message = decrypted(content: "habari yako", isEncrypted: true, encryptionMode: "e2ee")
        message.content = "habari za asubuhi"

        XCTAssertEqual(disposition(of: message), .skip)
    }

    /// Hors bout en bout, la provenance ne compte pas : le serveur lit déjà le message.
    func test_disposition_whereTheServerReadsTheMessage_ignoresTheProvenance() {
        XCTAssertEqual(disposition(of: makeMessage()), .shareable)
        XCTAssertEqual(disposition(of: decrypted()), .shareable)
    }

    func test_isEndToEnd_readsTheConversationAndTheMessage() {
        XCTAssertTrue(DeviceTranslationEligibility.isEndToEnd(makeMessage(), conversationEncryptionMode: "e2ee"))
        XCTAssertTrue(DeviceTranslationEligibility.isEndToEnd(makeMessage(encryptionMode: "e2ee"), conversationEncryptionMode: nil))
        XCTAssertFalse(DeviceTranslationEligibility.isEndToEnd(makeMessage(), conversationEncryptionMode: nil))
        XCTAssertFalse(DeviceTranslationEligibility.isEndToEnd(makeMessage(), conversationEncryptionMode: "server"))
    }

    // MARK: - Ce que la passerelle accepte : où le serveur lit déjà le message

    /// Miroir de la table « ce que la passerelle accepte » de
    /// `packages/shared/__tests__/shared-translation.test.ts` : les mêmes lignes,
    /// dans le même ordre.
    private typealias Row = (label: String, conversation: String?, isEncrypted: Bool, mode: String?)

    private let readableRows: [Row] = [
        ("un message en clair", nil, false, nil),
        ("un message en clair, conversation chiffrée par le serveur", "server", false, nil),
        ("un message chiffré par le serveur", nil, true, "server"),
        ("un message chiffré en mode hybride", "hybrid", true, "hybrid"),
        ("des modes écrits autrement", " Server ", true, "HYBRID")
    ]

    private let unreadableRows: [Row] = [
        ("une conversation chiffrée de bout en bout", "e2ee", false, nil),
        ("une conversation chiffrée de bout en bout, écrite autrement", " E2EE ", false, nil),
        ("un message chiffré de bout en bout", nil, true, "e2ee"),
        ("un message de bout en bout envoyé en clair", nil, false, "e2ee"),
        ("un message chiffré sans mode", nil, true, nil),
        ("un message chiffré sous un mode inconnu", nil, true, "x"),
        ("un message en clair sous un mode inconnu", nil, false, "x"),
        ("une conversation sous un mode inconnu", "x", false, nil)
    ]

    private func readsMessage(_ row: Row) -> Bool {
        DeviceTranslationEligibility.serverReadsMessage(
            conversationEncryptionMode: row.conversation, isEncrypted: row.isEncrypted, encryptionMode: row.mode
        )
    }

    func test_serverReadsMessage_aPlainOrServerEncryptedMessage_isReadable() {
        XCTAssertEqual(readableRows.count, 5)
        for row in readableRows {
            XCTAssertTrue(readsMessage(row), row.label)
        }
    }

    func test_serverReadsMessage_anythingTheServerCannotBeSureToRead_isNotReadable() {
        XCTAssertEqual(unreadableRows.count, 8)
        for row in unreadableRows {
            XCTAssertFalse(readsMessage(row), row.label)
        }
    }

    func test_isEndToEnd_isExactlyWhatTheServerDoesNotRead() {
        for row in readableRows + unreadableRows {
            let message = makeMessage(isEncrypted: row.isEncrypted, encryptionMode: row.mode)

            XCTAssertEqual(
                DeviceTranslationEligibility.isEndToEnd(message, conversationEncryptionMode: row.conversation),
                !readsMessage(row),
                row.label
            )
        }
    }

    func test_disposition_whereTheServerReadsTheMessage_isShareable() {
        for row in readableRows {
            let message = makeMessage(isEncrypted: row.isEncrypted, encryptionMode: row.mode)

            XCTAssertEqual(disposition(of: message, conversationMode: row.conversation), .shareable, row.label)
        }
    }

    func test_disposition_whereTheServerDoesNotReadTheMessage_isNeverShareable() {
        for row in unreadableRows {
            let clear = decrypted(isEncrypted: row.isEncrypted, encryptionMode: row.mode)
            let unproven = makeMessage(isEncrypted: row.isEncrypted, encryptionMode: row.mode)

            XCTAssertEqual(disposition(of: clear, conversationMode: row.conversation), .ephemeral, row.label)
            XCTAssertEqual(disposition(of: unproven, conversationMode: row.conversation), .skip, row.label)
        }
    }

    func test_disposition_anEncryptedMessageUnderAnUnknownMode_staysOnTheDevice() {
        let encrypted = decrypted(isEncrypted: true, encryptionMode: "x")

        XCTAssertNotEqual(disposition(of: encrypted), .shareable)
        XCTAssertEqual(disposition(of: encrypted), .ephemeral)
    }

    func test_disposition_aConversationUnderAnUnknownMode_staysOnTheDeviceForEveryMessage() {
        XCTAssertEqual(disposition(of: decrypted(), conversationMode: "x"), .ephemeral)
        XCTAssertEqual(disposition(of: decrypted(isEncrypted: true, encryptionMode: "server"), conversationMode: "x"), .ephemeral)
    }

    func test_disposition_anUnknownModeStillInItsCiphertext_isSkipped() {
        let ciphertext = Data((0..<40).map(UInt8.init)).base64EncodedString()

        XCTAssertEqual(disposition(of: makeMessage(content: ciphertext, isEncrypted: true, encryptionMode: "x")), .skip)
    }
}
