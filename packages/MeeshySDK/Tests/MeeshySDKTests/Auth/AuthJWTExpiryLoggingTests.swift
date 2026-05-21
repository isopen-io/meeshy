import XCTest
@testable import MeeshySDK

/// D2 — pin `AuthManager.isTokenExpired(_:now:)` decode robustness.
///
/// Every "malformed → expired" branch must remain detectable so support
/// can trace a silent-logout report back to the actual decode failure.
/// We can't observe the log output here, but we can pin the *behavior*:
/// every malformed token returns `true` so the refresh path engages.
final class AuthJWTExpiryLoggingTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    func test_nilToken_isExpired() {
        XCTAssertTrue(AuthManager.isTokenExpired(nil, now: now))
    }

    func test_singlePart_isExpired() {
        XCTAssertTrue(AuthManager.isTokenExpired("header-only", now: now))
    }

    func test_twoParts_isExpired() {
        XCTAssertTrue(AuthManager.isTokenExpired("header.payload", now: now))
    }

    func test_invalidBase64Payload_isExpired() {
        XCTAssertTrue(AuthManager.isTokenExpired("aaa.!!!!.bbb", now: now))
    }

    func test_validBase64_butNotJson_isExpired() {
        let notJsonB64 = Data("hello".utf8).base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
        XCTAssertTrue(AuthManager.isTokenExpired("aaa.\(notJsonB64).bbb", now: now))
    }

    func test_validJson_butMissingExpClaim_isExpired() {
        let payload = Data(#"{"sub":"123","iat":1700000000}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
        XCTAssertTrue(AuthManager.isTokenExpired("aaa.\(payload).bbb", now: now))
    }

    func test_validJsonWithFutureExp_isNotExpired() {
        let future = Int(now.addingTimeInterval(3600).timeIntervalSince1970)
        let payload = Data(#"{"sub":"123","exp":\#(future)}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
        XCTAssertFalse(AuthManager.isTokenExpired("aaa.\(payload).bbb", now: now))
    }

    func test_validJsonWithPastExp_isExpired() {
        let past = Int(now.addingTimeInterval(-3600).timeIntervalSince1970)
        let payload = Data(#"{"sub":"123","exp":\#(past)}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
        XCTAssertTrue(AuthManager.isTokenExpired("aaa.\(payload).bbb", now: now))
    }

    /// 30-second leeway is intentional — pins the safety margin.
    func test_validJsonWithExpInThirtySeconds_isAlreadyExpired() {
        let within = Int(now.addingTimeInterval(20).timeIntervalSince1970)
        let payload = Data(#"{"sub":"123","exp":\#(within)}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
        XCTAssertTrue(AuthManager.isTokenExpired("aaa.\(payload).bbb", now: now))
    }
}
