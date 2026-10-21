import XCTest
@testable import Meeshy

@MainActor
final class SessionTransitionPlanTests: XCTestCase {

    private func makeContext(userId: String? = "u1", hydrated: Bool = false, activeCall: Bool = false) -> SessionTransitionContext {
        SessionTransitionContext(userId: userId, friendshipsHydrated: hydrated, hasActiveCall: activeCall)
    }

    func test_opening_beginsByTaggingCrashReportsWithTheUserId() {
        XCTAssertEqual(SessionTransitionPlan.opening(makeContext(userId: "u42")).first, .tagCrashReports(userId: "u42"))
    }

    func test_opening_hydratesFriendshipsOnlyWhenNotHydrated() {
        XCTAssertTrue(SessionTransitionPlan.opening(makeContext(hydrated: false)).contains(.hydrateFriendships))
        XCTAssertFalse(SessionTransitionPlan.opening(makeContext(hydrated: true)).contains(.hydrateFriendships))
    }

    func test_opening_reconnectsSocketsBeforeActivatingTheStoreBridge() throws {
        let plan = SessionTransitionPlan.opening(makeContext())
        let reconnect = try XCTUnwrap(plan.firstIndex(of: .reconnectSockets))
        let bridge = try XCTUnwrap(plan.firstIndex(of: .activateConversationStoreBridge))
        XCTAssertLessThan(reconnect, bridge)
    }

    func test_opening_followsTheCurrentOrder() {
        XCTAssertEqual(SessionTransitionPlan.opening(makeContext(userId: "u1", hydrated: false)), [
            .tagCrashReports(userId: "u1"),
            .replayShareLinkAwaitingAccount,
            .startNotificationCoordinators,
            .startCache,
            .configureStoryPublishing,
            .hydrateFriendships,
            .reconnectSockets,
            .activateConversationStoreBridge,
            .promptPushPermission,
            .refreshUnreadCount,
            .reRegisterPushTokens,
            .uploadE2EEBundle,
            .migrateKeychain,
        ])
    }

    func test_closing_untagsFirst_clearsFriendshipsBeforeUnbindingCache() throws {
        let plan = SessionTransitionPlan.closing(makeContext())
        XCTAssertEqual(plan.first, .untagCrashReports)
        let friendships = try XCTUnwrap(plan.firstIndex(of: .clearFriendships))
        let cache = try XCTUnwrap(plan.firstIndex(of: .unbindCache))
        XCTAssertLessThan(friendships, cache)
    }

    func test_closing_endsAnActiveCallBeforeDisconnectingSockets() throws {
        let plan = SessionTransitionPlan.closing(makeContext(activeCall: true))
        let endCall = try XCTUnwrap(plan.firstIndex(of: .endActiveCall))
        let disconnect = try XCTUnwrap(plan.firstIndex(of: .disconnectSockets))
        XCTAssertLessThan(endCall, disconnect)
    }

    func test_closing_withoutActiveCall_hasNoEndCall() {
        XCTAssertFalse(SessionTransitionPlan.closing(makeContext(activeCall: false)).contains(.endActiveCall))
    }

    func test_closing_followsTheCurrentOrder() {
        XCTAssertEqual(SessionTransitionPlan.closing(makeContext(activeCall: true)), [
            .untagCrashReports,
            .resetNotifications,
            .clearFriendships,
            .clearE2EESessions,
            .unbindCache,
            .unregisterVoIP,
            .endActiveCall,
            .disconnectSockets,
            .stopSocketRelays,
            .cancelBackgroundTasks,
        ])
    }

    func test_closing_cancelsBackgroundTasksLast() {
        XCTAssertEqual(SessionTransitionPlan.closing(makeContext()).last, .cancelBackgroundTasks)
    }
}
