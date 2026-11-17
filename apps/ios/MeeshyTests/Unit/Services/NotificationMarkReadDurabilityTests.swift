import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// ios-systeme-4 (#19104) — **« Marquer comme lu » depuis la bannière passe par la file durable.**
///
/// Le geste faisait `localMarkRead` puis UN POST nu : hors réseau, la frontière locale masquait
/// l'échec sur l'iPhone, le serveur ne l'apprenait jamais et le `aps.badge` du push suivant
/// rallumait l'icône. Le geste passe désormais par `ConversationStore.markReadDurably`, dont la
/// file persistante rejoue au retour au premier plan (témoins de la file :
/// `ConversationStoreDurableMarkReadTests`, côté SDK).
///
/// Ici : le CÂBLAGE. Le store prend le geste en charge ⇒ aucun POST direct (pas de double envoi) ;
/// il le décline (conversation inconnue) ⇒ le POST direct reste le repli.
@MainActor
final class NotificationMarkReadDurabilityTests: XCTestCase {

    private final class NoopBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier {
            UIBackgroundTaskIdentifier(rawValue: 7)
        }
        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    private final class Ledger {
        var locallyMarkedRead: [String] = []
        var removedBanners: [String] = []
        var durableAsked: [String] = []
        var events: [String] = []
    }

    private struct SUT {
        let handler: NotificationActionHandler
        let conversations: MockConversationService
        let ledger: Ledger
    }

    private func makeSUT(storeTakesTheMark: Bool) -> SUT {
        let conversations = MockConversationService()
        let ledger = Ledger()
        let handler = NotificationActionHandler(
            conversationService: conversations,
            backgroundTasks: NoopBackgroundTasks(),
            authTokenProvider: { "jwt-token" },
            applyAuthToken: { _ in },
            currentUserId: { "user1" },
            preferredLanguage: { "fr" },
            isRegisteredUser: { true },
            openNotification: { _ in },
            localMarkRead: { ledger.locallyMarkedRead.append($0); ledger.events.append("local") },
            consume: { _ in },
            removeDeliveredForConversation: { ledger.removedBanners.append($0) },
            removeDeliveredForPost: { _ in },
            removeDeliveredForNotificationIds: { _ in },
            conversationLocks: DeclaredConversationLocks(),
            destinationGuard: .isolated(),
            markReadThroughStore: {
                ledger.durableAsked.append($0)
                ledger.events.append("durable")
                return storeTakesTheMark
            }
        )
        return SUT(handler: handler, conversations: conversations, ledger: ledger)
    }

    private func markReadPayload(conversationId: String = "convX") -> [AnyHashable: Any] {
        ["type": "new_message", "conversationId": conversationId, "messageId": "m1", "senderId": "sender1"]
    }

    private func tapMarkRead(_ sut: SUT, conversationId: String = "convX") async {
        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.markRead.rawValue,
            userInfo: markReadPayload(conversationId: conversationId),
            replyText: nil
        )
    }

    func test_markRead_whenTheStoreTakesTheMark_doesNotPostASecondTime() async {
        let sut = makeSUT(storeTakesTheMark: true)

        await tapMarkRead(sut)

        XCTAssertEqual(sut.ledger.durableAsked, ["convX"])
        XCTAssertEqual(sut.conversations.markReadCallCount, 0, "la file du store porte l'envoi : pas de POST nu en plus")
        XCTAssertEqual(sut.ledger.locallyMarkedRead, ["convX"])
        XCTAssertEqual(sut.ledger.removedBanners, ["convX"])
    }

    func test_markRead_whenTheStoreDeclines_fallsBackToTheDirectPost() async {
        let sut = makeSUT(storeTakesTheMark: false)

        await tapMarkRead(sut)

        XCTAssertEqual(sut.conversations.markReadCallCount, 1)
        XCTAssertEqual(sut.conversations.lastMarkReadConversationId, "convX")
        XCTAssertEqual(sut.ledger.removedBanners, ["convX"])
    }

    func test_markRead_marksLocallyBeforeAskingTheStore() async {
        let sut = makeSUT(storeTakesTheMark: true)

        await tapMarkRead(sut)

        XCTAssertEqual(sut.ledger.events, ["local", "durable"], "la bannière et la ligne réagissent d'abord, le réseau ensuite")
    }

    func test_markRead_withoutConversationId_touchesNothing() async {
        let sut = makeSUT(storeTakesTheMark: true)

        await sut.handler.handle(
            actionIdentifier: MeeshyNotificationAction.markRead.rawValue,
            userInfo: ["type": "friend_request"],
            replyText: nil
        )

        XCTAssertTrue(sut.ledger.durableAsked.isEmpty)
        XCTAssertEqual(sut.conversations.markReadCallCount, 0)
    }
}
