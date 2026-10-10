import Testing
import Foundation
@testable import MeeshySDK

/// #9574 — la CITATION d'un contenu qui disparaît se protège comme lui de la
/// capture d'écran, même posée dans un message ordinaire.
@Suite("ReplyReference — la capture d'une citation (#9574, #9617)")
struct QuotedCaptureTests {

    private static func reference(
        messageId: String = "q1",
        nature: ContentExitLaw.Nature? = nil,
        expiresAt: Date? = nil,
        mediaProtected: Bool? = nil
    ) -> ReplyReference {
        var reference = ReplyReference(
            messageId: messageId,
            authorName: "Bob",
            previewText: "Le code du portail est 4521",
            attachmentIsProtected: mediaProtected
        )
        reference.quotedExitNature = nature
        reference.quotedExpiresAt = expiresAt
        return reference
    }

    @Test("une citation ordinaire se capture")
    func ordinaryIsFree() {
        #expect(Self.reference(nature: .ordinary).quotedCapture(quotedMessage: nil) == .free)
        #expect(Self.reference().quotedCapture(quotedMessage: nil) == .free,
                "la passerelle ne déclare la nature d'une citation que si elle est voilée")
    }

    @Test("la citation d'une flamme ou d'une flamme après lecture est annoncée, pas noircie (#9617)",
          arguments: [ContentExitLaw.Nature.timedFlame, .afterReadFlame])
    func declaredFlameIsAnnounced(nature: ContentExitLaw.Nature) {
        #expect(Self.reference(nature: nature).quotedCapture(quotedMessage: nil) == .announced)
    }

    @Test("la citation d'une vue unique est noire")
    func declaredViewOnceIsBlocked() {
        #expect(Self.reference(nature: .viewOnce).quotedCapture(quotedMessage: nil) == .blocked)
    }

    @Test("une échéance citée suffit : le cité est éphémère, sa capture s'annonce")
    func quotedDeadlineIsAnnounced() {
        let reference = Self.reference(expiresAt: Date(timeIntervalSince1970: 1_790_000_000))
        #expect(reference.quotedCapture(quotedMessage: nil) == .announced)
    }

    @Test("un média cité protégé est protégé")
    func protectedMediaIsBlocked() {
        #expect(Self.reference(mediaProtected: true).quotedCapture(quotedMessage: nil) == .blocked)
    }

    @Test("le message cité RÉEL, quand il est en mémoire, fait foi")
    func realQuotedMessageDecides() {
        var flame = MeeshyMessage(id: "q1", conversationId: "c1", senderId: "p-bob", content: "secret")
        flame.effects = MessageEffects(flags: .ephemeral, ephemeralDuration: 30)
        #expect(Self.reference(nature: .ordinary).quotedCapture(quotedMessage: flame) == .announced)

        var once = MeeshyMessage(id: "q1", conversationId: "c1", senderId: "p-bob", content: "secret")
        once.effects = MessageEffects(flags: .viewOnce)
        #expect(Self.reference(nature: .ordinary).quotedCapture(quotedMessage: once) == .blocked)

        let ordinary = MeeshyMessage(id: "q1", conversationId: "c1", senderId: "p-bob", content: "bonjour")
        #expect(Self.reference(nature: .viewOnce).quotedCapture(quotedMessage: ordinary) == .free)

        let stranger = MeeshyMessage(id: "autre", conversationId: "c1", senderId: "p-bob", content: "bonjour")
        #expect(Self.reference(nature: .viewOnce).quotedCapture(quotedMessage: stranger) == .blocked,
                "un message qui n'est pas le cité ne décide rien")
    }
}
