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

    private func afterRead(expiresAt: Date? = nil, viewOnce: Bool = false) -> MeeshyConversation {
        var conv = makeConversation(viewOnce: viewOnce, expiresAt: expiresAt)
        conv.lastMessageNature = LastMessageNature(effectFlags: 1 | 8)
        return conv
    }

    @Test("Flamme-œil (#8634) → afterRead, jamais le texte")
    func afterReadIsProtected() {
        #expect(afterRead().lastMessageSummaryKind() == .afterRead)
    }

    @Test("Flamme-œil consommée (échéance servie passée) → expired")
    func afterReadConsumed() {
        let now = Date()
        #expect(afterRead(expiresAt: now.addingTimeInterval(-60)).lastMessageSummaryKind(now: now) == .expired)
    }

    @Test("La vue unique passe devant la flamme-œil")
    func viewOnceBeatsAfterRead() {
        #expect(afterRead(viewOnce: true).lastMessageSummaryKind() == .viewOnce)
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

    @Test("Vue-unique prime sur éphémère encore actif")
    func viewOnceBeatsEphemeralActive() {
        let now = Date()
        let conv = makeConversation(viewOnce: true, expiresAt: now.addingTimeInterval(60))
        #expect(conv.lastMessageSummaryKind(now: now) == .viewOnce)
    }
}
