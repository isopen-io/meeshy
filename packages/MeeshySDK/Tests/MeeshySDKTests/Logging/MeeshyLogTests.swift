import XCTest
import os
@testable import MeeshySDK

final class MeeshyLogTests: XCTestCase {

    func test_subsystem_isTheHistoricalAppSubsystem() {
        XCTAssertEqual(MeeshyLog.subsystem, "me.meeshy.app")
    }

    func test_categoryRawValues_matchHistoricalCategoryStrings() {
        let raw = MeeshyLog.Category.allCases.map(\.rawValue)

        XCTAssertEqual(raw, ["network", "auth", "messages", "media", "socket", "cache", "ui", "pip", "grdb"])
    }

    func test_loggerShortcuts_stillExist() {
        let shortcuts: [Logger] = [
            .network, .auth, .messages, .media, .socket, .cache, .ui, .pip,
        ]

        XCTAssertEqual(shortcuts.count, 8)
    }
}
