import XCTest
@testable import MeeshySDK

final class MeeshyLogMigratedSitesTests: XCTestCase {

    func test_migratedAppSites_keepTheirHistoricalAddress() {
        XCTAssertEqual(
            MeeshyLog.address(.retention, subsystem: .legacyApp),
            LogAddress(subsystem: "com.meeshy.app", category: "retention")
        )
        XCTAssertEqual(
            MeeshyLog.address(.outboxDispatcher, subsystem: .legacyIOS),
            LogAddress(subsystem: "com.meeshy.ios", category: "outbox-dispatcher")
        )
        XCTAssertEqual(
            MeeshyLog.address(.conversationCommands),
            LogAddress(subsystem: "me.meeshy.app", category: "conversation-commands")
        )
    }
}
