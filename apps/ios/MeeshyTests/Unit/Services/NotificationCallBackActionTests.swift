import UIKit
import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class NotificationCallBackActionTests: XCTestCase {

    private final class InertBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier {
            UIBackgroundTaskIdentifier(rawValue: 7)
        }

        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    private final class InertReplyQueue: NotificationReplyQueueing {
        func enqueue(_ item: OfflineQueueItem) async throws {}

        @discardableResult
        func enqueue<P: Codable & Sendable>(
            _ kind: OutboxKind,
            payload: P,
            conversationId: String?
        ) async throws -> String {
            "ofqm_inert"
        }
    }

    private final class InertPersistence: OptimisticMessagePersisting {
        func insertOptimistic(_ record: MessageRecord) async throws {}
        func markOptimisticFailed(localId: String, reason: String) async throws {}
    }

    private struct Context {
        let sut: NotificationActionHandler
        let dialed: () -> [CallBackRequest]
        let opened: () -> Int
        let consumed: () -> [NotificationRef]
    }

    private func makeSUT() -> Context {
        var dialed: [CallBackRequest] = []
        var opened = 0
        var consumed: [NotificationRef] = []
        let sut = NotificationActionHandler(
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            postService: MockPostService(),
            friendService: MockFriendService(),
            replyQueue: InertReplyQueue(),
            messagePersistence: InertPersistence(),
            backgroundTasks: InertBackgroundTasks(),
            authTokenProvider: { "jwt" },
            applyAuthToken: { _ in },
            currentUserId: { "me" },
            preferredLanguage: { "fr" },
            isRegisteredUser: { true },
            openNotification: { _ in opened += 1 },
            dialCallBack: { dialed.append($0) },
            localMarkRead: { _ in },
            consume: { consumed.append($0) },
            removeDeliveredForConversation: { _ in },
            removeDeliveredForPost: { _ in },
            removeDeliveredForNotificationIds: { _ in },
            prepareReplyQueue: {}
        )
        return Context(sut: sut, dialed: { dialed }, opened: { opened }, consumed: { consumed })
    }

    func test_handle_callbackOnMissedVideoCall_dialsTheCallerInVideo_withoutOpeningTheThread() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.callback.rawValue,
            userInfo: [
                "notificationId": "n-1",
                "type": "missed_call",
                "senderId": "u-ada",
                "senderDisplayName": "Ada",
                "conversationId": "c-ada",
                "isVideo": "true"
            ],
            replyText: nil
        )

        XCTAssertEqual(ctx.dialed(), [CallBackRequest(userId: "u-ada", displayName: "Ada", isVideo: true, conversationId: "c-ada")])
        XCTAssertEqual(ctx.opened(), 0)
        XCTAssertEqual(ctx.consumed(), [.notification(id: "n-1")])
    }

    func test_handle_callbackOnMissedAudioCall_dialsInAudio() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.callback.rawValue,
            userInfo: ["type": "missed_call", "senderId": "u-ada", "conversationId": "c-ada", "isVideo": "false"],
            replyText: nil
        )

        XCTAssertEqual(ctx.dialed().first?.isVideo, false)
    }

    func test_handle_callbackWithoutCaller_opensTheNotification_andDialsNothing() async {
        let ctx = makeSUT()

        await ctx.sut.handle(
            actionIdentifier: MeeshyNotificationAction.callback.rawValue,
            userInfo: ["type": "missed_call", "conversationId": "c-ada"],
            replyText: nil
        )

        XCTAssertTrue(ctx.dialed().isEmpty)
        XCTAssertEqual(ctx.opened(), 1)
    }
}
