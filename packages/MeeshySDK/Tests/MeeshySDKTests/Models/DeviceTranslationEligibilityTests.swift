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
        attachments: [MeeshyMessageAttachment] = []
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: "64f0c0ffee0000000000a001", conversationId: "64f0c0ffee0000000000c0de", senderId: "u-other",
            content: content, originalLanguage: originalLanguage, messageSource: source,
            deletedAt: deletedAt, expiresAt: expiresAt, effects: effects,
            isEncrypted: isEncrypted, encryptionMode: encryptionMode,
            attachments: attachments, isMe: isMe
        )
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
        XCTAssertEqual(disposition(of: makeMessage(isEncrypted: true, encryptionMode: "e2ee")), .ephemeral)
        XCTAssertEqual(disposition(of: makeMessage(isEncrypted: true, encryptionMode: "E2EE")), .ephemeral)
        XCTAssertEqual(disposition(of: makeMessage(encryptionMode: "e2ee")), .ephemeral)
    }

    func test_disposition_anEndToEndConversation_staysOnTheDeviceForEveryMessage() {
        XCTAssertEqual(disposition(of: makeMessage(), conversationMode: "e2ee"), .ephemeral)
        XCTAssertEqual(disposition(of: makeMessage(), conversationMode: "E2EE"), .ephemeral)
    }

    func test_disposition_anEncryptedMessageThatAnnouncesNoMode_isTreatedAsEndToEnd() {
        XCTAssertEqual(disposition(of: makeMessage(isEncrypted: true)), .ephemeral)
        XCTAssertEqual(disposition(of: makeMessage(isEncrypted: true, encryptionMode: " ")), .ephemeral)
    }

    func test_disposition_anEndToEndMessageStillInItsCiphertext_isSkipped() {
        let ciphertext = Data((0..<40).map(UInt8.init)).base64EncodedString()

        XCTAssertEqual(disposition(of: makeMessage(content: ciphertext, isEncrypted: true, encryptionMode: "e2ee")), .skip)
        XCTAssertEqual(disposition(of: makeMessage(content: ciphertext), conversationMode: "e2ee"), .skip)
    }

    func test_looksLikeCiphertext_recognisesBase64WithoutBlanksOnly() {
        let ciphertext = Data((0..<40).map(UInt8.init)).base64EncodedString()

        XCTAssertTrue(DeviceTranslationEligibility.looksLikeCiphertext(ciphertext))
        XCTAssertFalse(DeviceTranslationEligibility.looksLikeCiphertext("habari yako"))
        XCTAssertFalse(DeviceTranslationEligibility.looksLikeCiphertext("Rendez-vous demain devant la gare, à midi."))
        XCTAssertFalse(DeviceTranslationEligibility.looksLikeCiphertext(String(ciphertext.prefix(20))))
        XCTAssertFalse(DeviceTranslationEligibility.looksLikeCiphertext("\(ciphertext.prefix(20)) \(ciphertext.suffix(20))"))
    }

    func test_isEndToEnd_readsTheConversationAndTheMessage() {
        XCTAssertTrue(DeviceTranslationEligibility.isEndToEnd(makeMessage(), conversationEncryptionMode: "e2ee"))
        XCTAssertTrue(DeviceTranslationEligibility.isEndToEnd(makeMessage(encryptionMode: "e2ee"), conversationEncryptionMode: nil))
        XCTAssertFalse(DeviceTranslationEligibility.isEndToEnd(makeMessage(), conversationEncryptionMode: nil))
        XCTAssertFalse(DeviceTranslationEligibility.isEndToEnd(makeMessage(), conversationEncryptionMode: "server"))
    }
}
