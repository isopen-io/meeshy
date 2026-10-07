import Testing
import Foundation
@testable import MeeshySDK

/// #9574 — la CITATION d'un contenu qui disparaît se protège comme lui de la
/// capture d'écran, même posée dans un message ordinaire.
@Suite("ReplyReference — la capture d'une citation (#9574)")
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

    @Test("la citation d'une flamme, d'une flamme après lecture ou d'une vue unique est protégée",
          arguments: [ContentExitLaw.Nature.timedFlame, .afterReadFlame, .viewOnce])
    func declaredNatureIsBlocked(nature: ContentExitLaw.Nature) {
        #expect(Self.reference(nature: nature).quotedCapture(quotedMessage: nil) == .blocked)
    }

    @Test("une échéance citée suffit : le cité est éphémère")
    func quotedDeadlineIsBlocked() {
        let reference = Self.reference(expiresAt: Date(timeIntervalSince1970: 1_790_000_000))
        #expect(reference.quotedCapture(quotedMessage: nil) == .blocked)
    }

    @Test("un média cité protégé est protégé")
    func protectedMediaIsBlocked() {
        #expect(Self.reference(mediaProtected: true).quotedCapture(quotedMessage: nil) == .blocked)
    }

    @Test("le message cité RÉEL, quand il est en mémoire, fait foi")
    func realQuotedMessageDecides() {
        var flame = MeeshyMessage(id: "q1", conversationId: "c1", senderId: "p-bob", content: "secret")
        flame.effects = MessageEffects(flags: .ephemeral, ephemeralDuration: 30)
        #expect(Self.reference(nature: .ordinary).quotedCapture(quotedMessage: flame) == .blocked)

        let ordinary = MeeshyMessage(id: "q1", conversationId: "c1", senderId: "p-bob", content: "bonjour")
        #expect(Self.reference(nature: .viewOnce).quotedCapture(quotedMessage: ordinary) == .free)

        let stranger = MeeshyMessage(id: "autre", conversationId: "c1", senderId: "p-bob", content: "bonjour")
        #expect(Self.reference(nature: .viewOnce).quotedCapture(quotedMessage: stranger) == .blocked,
                "un message qui n'est pas le cité ne décide rien")
    }
}
