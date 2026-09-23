import Testing
import Foundation
@testable import MeeshySDK

/// **Rien d'une vue unique avant son ouverture** (#7618).
///
/// Une vue unique non ouverte est SCELLÉE : aucun mode de lecture ne rend son
/// texte, sa légende ni son média, et le lecteur d'écran ne les lit pas. Le
/// sceau se décide ICI, sur le message, pour que les cinq modes posent la même
/// question au même site.
@Suite("Le sceau d'une vue unique — rien du contenu avant l'ouverture")
struct ViewOnceSealTests {

    private func message(
        flags: MessageEffectFlags = [],
        attachments: [MeeshyMessageAttachment] = [],
        isRevealed: Bool = false
    ) -> MeeshyMessage {
        var message = MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: "s1", content: "SECRET",
            attachments: attachments
        )
        message.effects = MessageEffects(flags: flags)
        message.isViewOnceRevealed = isRevealed
        return message
    }

    private func photo(isViewOnce: Bool) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "a1", messageId: "m1", fileName: "p.jpg", originalName: "p.jpg",
            mimeType: "image/jpeg", fileSize: 10, fileUrl: "https://x/p.jpg",
            isViewOnce: isViewOnce
        )
    }

    @Test("Un message ordinaire n'est pas scellé")
    func test_isViewOnceSealed_ordinaryMessage_isFalse() {
        #expect(message().isViewOnceSealed == false)
        #expect(message().holdsViewOnce == false)
    }

    @Test("Une vue unique non ouverte est scellée")
    func test_isViewOnceSealed_viewOnceNotRevealed_isTrue() {
        #expect(message(flags: [.viewOnce]).isViewOnceSealed)
    }

    @Test("Une PIÈCE à vue unique scelle aussi le message et sa légende")
    func test_isViewOnceSealed_viewOnceAttachmentOnly_isTrue() {
        let sealed = message(attachments: [photo(isViewOnce: true)])
        #expect(sealed.holdsViewOnce)
        #expect(sealed.isViewOnceSealed)
    }

    @Test("Une vue unique révélée n'est plus scellée")
    func test_isViewOnceSealed_revealed_isFalse() {
        #expect(message(flags: [.viewOnce], isRevealed: true).isViewOnceSealed == false)
    }

    @Test("Un message supprimé n'est pas scellé : il n'a plus de contenu")
    func test_isViewOnceSealed_deleted_isFalse() {
        var deleted = message(flags: [.viewOnce])
        deleted.deletedAt = Date()
        #expect(deleted.isViewOnceSealed == false)
    }

    @Test("Le média ouvrable d'une vue unique est sa première pièce visuelle")
    func test_openableViewOnceMedia_photo_returnsAttachment() {
        let sealed = message(attachments: [photo(isViewOnce: true)])
        #expect(sealed.openableViewOnceMedia?.id == "a1")
    }

    @Test("Un vocal à vue unique se lit sur place : pas de plein écran visuel")
    func test_openableViewOnceMedia_audio_isNil() {
        let voice = MeeshyMessageAttachment(
            id: "a2", messageId: "m1", mimeType: "audio/m4a", fileUrl: "https://x/v.m4a", isViewOnce: true
        )
        #expect(message(attachments: [voice]).openableViewOnceMedia == nil)
    }

    @Test("Un texte à vue unique n'a aucun média ouvrable : il se lit sur place")
    func test_openableViewOnceMedia_text_isNil() {
        #expect(message(flags: [.viewOnce]).openableViewOnceMedia == nil)
    }

    @Test("Scellé, le message ne transporte plus rien de son contenu")
    func test_sealedForDisplay_sealed_dropsEveryContent() {
        let sealed = message(flags: [.viewOnce], attachments: [photo(isViewOnce: true)]).sealedForDisplay
        #expect(sealed.content.isEmpty)
        #expect(sealed.attachments.isEmpty)
        #expect(sealed.sticker == nil)
        #expect(sealed.location == nil)
        #expect(sealed.isViewOnce)
        #expect(sealed.id == "m1")
    }

    @Test("Scellé depuis une PIÈCE, le message reste une vue unique une fois vidé")
    func test_sealedForDisplay_viewOnceAttachmentOnly_keepsViewOnceFlag() {
        let sealed = message(attachments: [photo(isViewOnce: true)]).sealedForDisplay
        #expect(sealed.attachments.isEmpty)
        #expect(sealed.isViewOnce)
        #expect(sealed.isViewOnceSealed)
    }

    @Test("Révélé, le message se rend tel quel")
    func test_sealedForDisplay_revealed_keepsContent() {
        let revealed = message(flags: [.viewOnce], attachments: [photo(isViewOnce: true)], isRevealed: true)
            .sealedForDisplay
        #expect(revealed.content == "SECRET")
        #expect(revealed.attachments.count == 1)
    }

    @Test("La puce dit la vue unique : le chrome ne la répète pas, l'éphémère reste")
    func test_withoutViewOnce_keepsEphemeralDropsViewOnce() {
        let descriptor = MessageProtectionDescriptor(
            badges: [.ephemeral(.awaitingReception(duration: 60)), .viewOnce],
            ephemeralState: .awaitingReception(duration: 60)
        )
        #expect(descriptor.withoutViewOnce.badges == [.ephemeral(.awaitingReception(duration: 60))])
    }

    @Test("Une pièce à vue unique porte le badge de vue unique, comme le drapeau du message")
    func test_protection_viewOnceAttachment_carriesViewOnceBadge() {
        let descriptor = message(attachments: [photo(isViewOnce: true)])
            .protection(ledger: InMemoryReceiptLedger(), now: Date())
        #expect(descriptor.isViewOnce)
        #expect(descriptor.requiresVeil)
    }
}

private struct InMemoryReceiptLedger: EphemeralReceiptRecording {
    func firstReception(of messageId: String) -> Date? { nil }
    func noteReception(of messageId: String, at date: Date) -> Date { date }
    func destruction(of messageId: String) -> Date? { nil }
    func noteDestruction(of messageId: String, at date: Date) {}
}
