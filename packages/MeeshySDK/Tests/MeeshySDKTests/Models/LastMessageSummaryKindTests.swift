import Testing
import Foundation
@testable import MeeshySDK

@Suite("LastMessageSummaryKind")
struct LastMessageSummaryKindTests {

    private func makeConversation(
        blurred: Bool = false,
        viewOnce: Bool = false,
        expiresAt: Date? = nil
    ) -> MeeshyConversation {
        MeeshyConversation(
            identifier: "conv-test",
            lastMessagePreview: "Texte du dernier message",
            lastMessageIsBlurred: blurred,
            lastMessageIsViewOnce: viewOnce,
            lastMessageExpiresAt: expiresAt
        )
    }

    @Test("Aucun effet → standard")
    func standard() {
        #expect(makeConversation().lastMessageSummaryKind() == .standard)
    }

    @Test("Message flouté → hidden")
    func blurred() {
        #expect(makeConversation(blurred: true).lastMessageSummaryKind() == .hidden)
    }

    @Test("Message vue-unique → viewOnce")
    func viewOnce() {
        #expect(makeConversation(viewOnce: true).lastMessageSummaryKind() == .viewOnce)
    }

    @Test("Expiration passée → expired")
    func expiredInPast() {
        let now = Date()
        let conv = makeConversation(expiresAt: now.addingTimeInterval(-60))
        #expect(conv.lastMessageSummaryKind(now: now) == .expired)
    }

    @Test("Expiration future → ephemeralActive")
    func ephemeralActive() {
        let now = Date()
        let conv = makeConversation(expiresAt: now.addingTimeInterval(60))
        #expect(conv.lastMessageSummaryKind(now: now) == .ephemeralActive)
    }

    @Test("Expiration passée prime sur flouté")
    func expiredBeatsBlurred() {
        let now = Date()
        let conv = makeConversation(blurred: true, expiresAt: now.addingTimeInterval(-60))
        #expect(conv.lastMessageSummaryKind(now: now) == .expired)
    }

    @Test("Flouté prime sur vue-unique")
    func blurredBeatsViewOnce() {
        #expect(makeConversation(blurred: true, viewOnce: true).lastMessageSummaryKind() == .hidden)
    }

    @Test("Flouté prime sur éphémère encore actif")
    func blurredBeatsEphemeralActive() {
        let now = Date()
        let conv = makeConversation(blurred: true, expiresAt: now.addingTimeInterval(60))
        #expect(conv.lastMessageSummaryKind(now: now) == .hidden)
    }
}
