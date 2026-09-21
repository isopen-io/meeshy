import Foundation
import Testing
@testable import MeeshySDK

/// Miroir de `packages/shared/utils/first-unread.test.ts` — mêmes 13 cas, plus
/// un 14e propre à Swift (le résultat est bien `Sendable`, pour un appel
/// hors `@MainActor`).
///
/// Cinq de ces témoins existent parce que la relecture a MESURÉ, par mutation
/// du TS, que la règle qu'ils nomment n'avait aucun témoin : retirer le filtre
/// `id != lastReadMessageId`, relâcher la frontière en `>=`, ou supprimer le
/// rang `joinedAt` laissait les huit premiers VERTS. Deux règles qui se
/// MASQUENT l'une l'autre sur les cas nominaux n'ont chacune aucun témoin.
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
            message("m1", other, "2026-09-21T10:00:00Z"),
            message("m2", viewer, "2026-09-21T10:01:00Z"),
            message("m3", other, "2026-09-21T10:02:00Z"),
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

    @Test("exclut le message AU curseur même quand son createdAt suit la frontière (décalage d'horloge)")
    func cursorMessageExcludedDespiteClockSkew() {
        let messages = [
            message("m2", other, "2026-09-21T10:01:00Z"), // le message lu, gravé APRÈS la frontière enregistrée
            message("m4", other, "2026-09-21T10:03:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: "m2", lastReadAt: nil,
            lastReadMessageCreatedAt: ISO8601DateFormatter().date(from: "2026-09-21T10:00:59Z"),
            viewerId: viewer)

        #expect(result == FirstUnreadBoundary.Result(firstUnreadId: "m4", unreadCount: 1))
    }

    @Test("exclut un message d'autrui posé EXACTEMENT sur la frontière (comparaison stricte)")
    func messageExactlyOnBoundaryExcluded() {
        let messages = [
            message("m1", other, "2026-09-21T10:02:00Z"), // à la frontière, mais PAS le message au curseur
            message("m2", other, "2026-09-21T10:05:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: nil,
            lastReadAt: ISO8601DateFormatter().date(from: "2026-09-21T10:02:00Z"),
            lastReadMessageCreatedAt: nil, viewerId: viewer)

        #expect(result == FirstUnreadBoundary.Result(firstUnreadId: "m2", unreadCount: 1))
    }

    @Test("replie sur joinedAt quand aucune lecture n'a jamais eu lieu (membre neuf d'un groupe ancien)")
    func fallsBackToJoinedAt() {
        let messages = [
            message("m1", other, "2019-04-02T09:00:00Z"),
            message("m2", other, "2019-04-03T09:00:00Z"),
            message("m3", other, "2026-09-21T10:04:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: nil, lastReadAt: nil,
            lastReadMessageCreatedAt: nil,
            joinedAt: ISO8601DateFormatter().date(from: "2026-09-21T10:00:00Z"),
            viewerId: viewer)

        #expect(result == FirstUnreadBoundary.Result(firstUnreadId: "m3", unreadCount: 1))
    }

    @Test("classe joinedAt APRÈS lastReadAt — un membre qui repart et revient garde sa lecture")
    func joinedAtRanksAfterLastReadAt() {
        let messages = [
            message("m1", other, "2026-09-21T10:01:00Z"),
            message("m2", other, "2026-09-21T10:06:00Z"),
        ]

        let result = FirstUnreadBoundary.resolve(
            messages: messages, lastReadMessageId: nil,
            lastReadAt: ISO8601DateFormatter().date(from: "2026-09-21T10:00:00Z"),
            lastReadMessageCreatedAt: nil,
            joinedAt: ISO8601DateFormatter().date(from: "2026-09-21T10:05:00Z"),
            viewerId: viewer)

        #expect(result == FirstUnreadBoundary.Result(firstUnreadId: "m1", unreadCount: 2))
    }

    @Test("départage par id deux messages gravés au MÊME instant, quel que soit l'ordre d'entrée")
    func sameInstantTieBrokenById() {
        let instant = "2026-09-21T10:07:00Z"
        let ordered = [message("mA", other, instant), message("mB", other, instant)]
        let reversed = [message("mB", other, instant), message("mA", other, instant)]

        let expected = FirstUnreadBoundary.Result(firstUnreadId: "mA", unreadCount: 2)
        #expect(FirstUnreadBoundary.resolve(
            messages: ordered, lastReadMessageId: nil, lastReadAt: nil,
            lastReadMessageCreatedAt: nil, viewerId: viewer) == expected)
        #expect(FirstUnreadBoundary.resolve(
            messages: reversed, lastReadMessageId: nil, lastReadAt: nil,
            lastReadMessageCreatedAt: nil, viewerId: viewer) == expected)
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
