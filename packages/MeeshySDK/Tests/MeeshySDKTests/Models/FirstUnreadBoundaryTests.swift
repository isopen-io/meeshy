import Foundation
import Testing
@testable import MeeshySDK

/// Miroir de `packages/shared/utils/first-unread.test.ts` — mêmes 8 cas, plus
/// un 9e propre à Swift (le résultat est bien `Sendable`, pour un appel
/// hors `@MainActor`).
@Suite("FirstUnreadBoundary")
struct FirstUnreadBoundaryTests {

    private let viewer = "viewer-1"
    private let other = "other-2"

    private func message(_ id: String, _ senderId: String, _ isoDate: String) -> FirstUnreadCandidateMessage {
        let formatter = ISO8601DateFormatter()
        return FirstUnreadCandidateMessage(id: id, senderId: senderId, createdAt: formatter.date(from: isoDate)!)
    }

    @Test("élit le premier message d'autrui quand le curseur est absent (participant neuf)")
    func noCursor_electsFirstOtherMessage() {
        let messages = [
            message("m1", "other-2", "2026-09-21T10:00:00Z"),
            message("m2", "viewer-1", "2026-09-21T10:01:00Z"),
            message("m3", "other-2", "2026-09-21T10:02:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: nil, lastReadAt: nil,
            lastReadMessageCreatedAt: nil, viewerId: viewer)

        #expect(result == FirstUnreadBoundary.Result(firstUnreadId: "m1", unreadCount: 2))
    }

    @Test("élit le premier message d'autrui STRICTEMENT après lastReadMessageCreatedAt, jamais le message au curseur")
    func boundaryAtCreatedAt_excludesCursorMessage() {
        let messages = [
            message("m1", other, "2026-09-21T10:00:00Z"),
            message("m2", other, "2026-09-21T10:01:00Z"), // au curseur
            message("m3", viewer, "2026-09-21T10:02:00Z"),
            message("m4", other, "2026-09-21T10:03:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: "m2", lastReadAt: nil,
            lastReadMessageCreatedAt: ISO8601DateFormatter().date(from: "2026-09-21T10:01:00Z"),
            viewerId: viewer)

        #expect(result == FirstUnreadBoundary.Result(firstUnreadId: "m4", unreadCount: 1))
    }

    @Test("ne compte ni n'élit jamais un message du LECTEUR, même après la frontière")
    func viewerOwnMessage_neverElected() {
        let messages = [
            message("m1", other, "2026-09-21T10:00:00Z"), // au curseur
            message("m2", viewer, "2026-09-21T10:01:00Z"), // exclu : c'est le lecteur
            message("m3", other, "2026-09-21T10:02:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: "m1", lastReadAt: nil,
            lastReadMessageCreatedAt: ISO8601DateFormatter().date(from: "2026-09-21T10:00:00Z"),
            viewerId: viewer)

        #expect(result == FirstUnreadBoundary.Result(firstUnreadId: "m3", unreadCount: 1))
    }

    @Test("rend nil quand tout est lu")
    func everythingRead_returnsNil() {
        let messages = [
            message("m1", other, "2026-09-21T10:00:00Z"),
            message("m2", other, "2026-09-21T10:01:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: "m2", lastReadAt: nil,
            lastReadMessageCreatedAt: ISO8601DateFormatter().date(from: "2026-09-21T10:01:00Z"),
            viewerId: viewer)

        #expect(result == nil)
    }

    @Test("rend nil quand la conversation n'a aucun message")
    func noMessages_returnsNil() {
        let result = FirstUnreadBoundary.resolve(
            messages: [], lastReadMessageId: nil, lastReadAt: nil,
            lastReadMessageCreatedAt: nil, viewerId: viewer)

        #expect(result == nil)
    }

    @Test("rend nil quand seuls des messages du lecteur suivent la frontière")
    func onlyViewerMessagesAfterBoundary_returnsNil() {
        let messages = [
            message("m1", other, "2026-09-21T10:00:00Z"), // au curseur
            message("m2", viewer, "2026-09-21T10:01:00Z"),
            message("m3", viewer, "2026-09-21T10:02:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: "m1", lastReadAt: nil,
            lastReadMessageCreatedAt: ISO8601DateFormatter().date(from: "2026-09-21T10:00:00Z"),
            viewerId: viewer)

        #expect(result == nil)
    }

    @Test("replie sur lastReadAt quand lastReadMessageCreatedAt est absent")
    func fallsBackToLastReadAt() {
        let messages = [
            message("m1", other, "2026-09-21T10:00:00Z"),
            message("m2", other, "2026-09-21T10:05:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: nil,
            lastReadAt: ISO8601DateFormatter().date(from: "2026-09-21T10:02:00Z"),
            lastReadMessageCreatedAt: nil, viewerId: viewer)

        #expect(result == FirstUnreadBoundary.Result(firstUnreadId: "m2", unreadCount: 1))
    }

    @Test("reste correct quand les messages ne sont pas triés en entrée")
    func unsortedInput_staysCorrect() {
        let messages = [
            message("m3", other, "2026-09-21T10:03:00Z"),
            message("m1", other, "2026-09-21T10:01:00Z"),
            message("m2", viewer, "2026-09-21T10:02:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: nil, lastReadAt: nil,
            lastReadMessageCreatedAt: nil, viewerId: viewer)

        #expect(result == FirstUnreadBoundary.Result(firstUnreadId: "m1", unreadCount: 2))
    }

    @Test("le résultat traverse une frontière de concurrence (Sendable)")
    func result_isSendable() async {
        let messages = [message("m1", other, "2026-09-21T10:00:00Z")]
        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: nil, lastReadAt: nil,
            lastReadMessageCreatedAt: nil, viewerId: viewer)

        let received: FirstUnreadBoundary.Result? = await Task.detached { result }.value
        #expect(received == FirstUnreadBoundary.Result(firstUnreadId: "m1", unreadCount: 1))
    }
}
