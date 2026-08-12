import XCTest
@testable import MeeshySDK

final class ClientInfoProviderTests: XCTestCase {

    private let requiredHeaderKeys = [
        "X-Meeshy-Version",
        "X-Meeshy-Build",
        "X-Meeshy-Platform",
        "X-Meeshy-Device",
        "X-Meeshy-OS",
        "X-Meeshy-Locale",
        "X-Device-Locale",
        "X-Meeshy-Timezone"
    ]

    // MARK: - Required Keys

    func test_buildHeaders_always_includesAllRequiredKeys() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        for key in requiredHeaderKeys {
            XCTAssertNotNil(headers[key], "Missing required header: \(key)")
        }
    }

    // MARK: - Platform

    func test_buildHeaders_platformKey_isAlwaysIOS() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertEqual(headers["X-Meeshy-Platform"], "ios")
    }

    // MARK: - Locale Format

    func test_buildHeaders_localeKey_usesDashSeparator() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let locale = headers["X-Meeshy-Locale"]!
        XCTAssertFalse(locale.contains("_"), "Locale should use dashes, not underscores: \(locale)")
    }

    // MARK: - Timezone

    func test_buildHeaders_timezoneKey_isNonEmpty() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let timezone = headers["X-Meeshy-Timezone"]!
        XCTAssertFalse(timezone.isEmpty)
    }

    // MARK: - Version

    func test_buildHeaders_versionKey_isNonEmpty() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let version = headers["X-Meeshy-Version"]!
        XCTAssertFalse(version.isEmpty)
    }

    // MARK: - Caching

    func test_buildHeaders_returnsCachedResult() async {
        let headers1 = await ClientInfoProvider.shared.buildHeaders()
        let headers2 = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertEqual(headers1["X-Meeshy-Version"], headers2["X-Meeshy-Version"])
        XCTAssertEqual(headers1["X-Meeshy-Device"], headers2["X-Meeshy-Device"])
        XCTAssertEqual(headers1["X-Meeshy-OS"], headers2["X-Meeshy-OS"])
    }

    // MARK: - Consistency

    func test_buildHeaders_calledTwice_stableKeysMatch() async {
        let first = await ClientInfoProvider.shared.buildHeaders()
        let second = await ClientInfoProvider.shared.buildHeaders()

        let stableKeys = ["X-Meeshy-Platform", "X-Meeshy-Device", "X-Meeshy-OS", "X-Meeshy-Version", "X-Meeshy-Build"]
        for key in stableKeys {
            XCTAssertEqual(first[key], second[key], "Header \(key) should be stable across calls")
        }
    }

    // MARK: - Non-Empty Values

    func test_buildHeaders_requiredKeys_allValuesNonEmpty() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        for key in requiredHeaderKeys {
            let value = headers[key]
            XCTAssertNotNil(value, "\(key) should exist")
            XCTAssertFalse(value?.isEmpty ?? true, "\(key) should not be empty")
        }
    }
}
