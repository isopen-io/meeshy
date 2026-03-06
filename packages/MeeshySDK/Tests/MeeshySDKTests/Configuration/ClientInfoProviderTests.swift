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
        "X-Meeshy-Timezone"
    ]

    // MARK: - Required Keys

    func testBuildHeadersReturnsAllRequiredKeys() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        for key in requiredHeaderKeys {
            XCTAssertNotNil(headers[key], "Missing required header: \(key)")
        }
    }

    // MARK: - Platform

    func testPlatformIsAlwaysiOS() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertEqual(headers["X-Meeshy-Platform"], "ios")
    }

    // MARK: - Locale Format

    func testLocaleUsesDashSeparator() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let locale = headers["X-Meeshy-Locale"]!
        XCTAssertFalse(locale.contains("_"), "Locale should use dashes, not underscores: \(locale)")
    }

    // MARK: - Timezone

    func testTimezoneIsNonEmpty() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let timezone = headers["X-Meeshy-Timezone"]!
        XCTAssertFalse(timezone.isEmpty)
    }

    // MARK: - Version

    func testVersionIsNonEmpty() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let version = headers["X-Meeshy-Version"]!
        XCTAssertFalse(version.isEmpty)
    }

    // MARK: - Consistency

    func testHeadersAreConsistentAcrossCalls() async {
        let first = await ClientInfoProvider.shared.buildHeaders()
        let second = await ClientInfoProvider.shared.buildHeaders()

        let stableKeys = ["X-Meeshy-Platform", "X-Meeshy-Device", "X-Meeshy-OS", "X-Meeshy-Version", "X-Meeshy-Build"]
        for key in stableKeys {
            XCTAssertEqual(first[key], second[key], "Header \(key) should be stable across calls")
        }
    }

    // MARK: - Non-Empty Values

    func testAllRequiredValuesAreNonEmpty() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        for key in requiredHeaderKeys {
            let value = headers[key]
            XCTAssertNotNil(value, "\(key) should exist")
            XCTAssertFalse(value?.isEmpty ?? true, "\(key) should not be empty")
        }
    }
}
