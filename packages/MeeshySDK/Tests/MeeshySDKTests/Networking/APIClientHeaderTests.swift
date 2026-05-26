import XCTest
@testable import MeeshySDK

/// Phase 3 — Task 8 : verifies that every outgoing request carries the
/// `X-Device-Locale` header expected by the gateway middleware
/// (`services/gateway/src/middleware/deviceLocale.ts`). The middleware
/// reads `req.headers['x-device-locale']` and persists the normalised ISO
/// 639-1 code into `User.deviceLocale`, propagated to the translator as
/// the 4th-priority destination per the Prisme Linguistique.
///
/// Source du contrat header :
/// `packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift`
/// — émet `X-Device-Locale` à partir de `Locale.current.identifier`
/// converti en forme RFC 5646 (`_` → `-`).
final class APIClientHeaderTests: XCTestCase {

    func test_buildURLRequest_injectsXDeviceLocale_fromLocaleCurrent() async throws {
        let request = try await APIClient.shared._buildURLRequestForTesting(
            endpoint: "/test/echo"
        )

        let value = request.value(forHTTPHeaderField: "X-Device-Locale")
        XCTAssertNotNil(value, "X-Device-Locale header must be present")
        XCTAssertGreaterThanOrEqual((value ?? "").count, 2,
                                    "X-Device-Locale must carry at least an ISO 639-1 code")
    }

    func test_buildURLRequest_normalizesUnderscoreToDash_inXDeviceLocale() async throws {
        // `Locale.current.identifier` on iOS / simulator returns `fr_FR`-style
        // (POSIX, underscore separator). The header MUST be RFC 5646 with
        // dashes so the gateway middleware parser keeps working uniformly
        // for iOS and web `Accept-Language` clients.
        let request = try await APIClient.shared._buildURLRequestForTesting(
            endpoint: "/test/echo"
        )
        let value = request.value(forHTTPHeaderField: "X-Device-Locale") ?? ""
        XCTAssertFalse(value.contains("_"),
                       "Underscore should be converted to dash, got: \(value)")
    }

    func test_buildURLRequest_xDeviceLocale_matchesXMeeshyLocale() async throws {
        // Coordination contract: `X-Meeshy-Locale` (existing telemetry header)
        // and `X-Device-Locale` (new Prisme 4th-priority header) MUST carry
        // the same RFC 5646 value so a future consolidation does not change
        // observable server-side behaviour.
        let request = try await APIClient.shared._buildURLRequestForTesting(
            endpoint: "/test/echo"
        )
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Device-Locale"),
                       request.value(forHTTPHeaderField: "X-Meeshy-Locale"))
    }

    func test_buildURLRequest_preservesCallerHeaders_alongsideXDeviceLocale() async throws {
        let request = try await APIClient.shared._buildURLRequestForTesting(
            endpoint: "/test/echo",
            headers: ["X-Custom-Header": "abc"]
        )
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Custom-Header"), "abc")
        XCTAssertNotNil(request.value(forHTTPHeaderField: "X-Device-Locale"))
    }
}
