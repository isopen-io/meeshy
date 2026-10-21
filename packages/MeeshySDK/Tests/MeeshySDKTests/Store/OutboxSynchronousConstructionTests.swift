import XCTest
@testable import MeeshySDK

final class OutboxSynchronousConstructionTests: XCTestCase {

    private func temporaryPath() -> String {
        NSTemporaryDirectory() + "outbox-sync-\(UUID().uuidString).db"
    }

    func test_conversationStateOutbox_initWithPath_isCallableFromNonisolatedSynchronousContext() {
        let outbox = ConversationStateOutbox(dbPath: temporaryPath())
        XCTAssertNotNil(outbox)
    }

    func test_engagementOutbox_initWithPath_isCallableFromNonisolatedSynchronousContext() {
        let outbox = EngagementOutbox(dbPath: temporaryPath())
        XCTAssertNotNil(outbox)
    }

    func test_engagementOutbox_defaultInit_isCallableFromNonisolatedSynchronousContext() {
        let outbox = EngagementOutbox()
        XCTAssertNotNil(outbox)
    }

    func test_socialEventsV2Outbox_initWithPath_isCallableFromNonisolatedSynchronousContext() {
        let outbox = SocialEventsV2Outbox(dbPath: temporaryPath())
        XCTAssertNotNil(outbox)
    }

    func test_socialEventsV2Outbox_defaultInit_isCallableFromNonisolatedSynchronousContext() {
        let outbox = SocialEventsV2Outbox()
        XCTAssertNotNil(outbox)
    }
}
