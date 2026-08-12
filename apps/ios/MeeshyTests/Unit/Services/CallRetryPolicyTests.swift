import XCTest
@testable import Meeshy

// MARK: - Retry-on-failure decision

/// `CallRetryPolicy.isRetryable` decides which ended calls warrant a
/// « Réessayer » affordance. Only TRANSIENT establishment/drop failures
/// (`.failed` / `.connectionLost`) — a retry often recovers those (prod
/// 2026-07-12: ~16% of calls). Normal outcomes (local/remote hangup, missed,
/// rejected) never re-dial. Parité web `isRetryableCallFailure` / Android
/// `CallRetryPolicy`: one rule, three platforms.
final class CallRetryPolicyTests: XCTestCase {

    func test_isRetryable_transientFailures_true() {
        XCTAssertTrue(CallRetryPolicy.isRetryable(.failed("Couldn't establish the call connection")))
        XCTAssertTrue(CallRetryPolicy.isRetryable(.connectionLost))
    }

    func test_isRetryable_normalOutcomes_false() {
        XCTAssertFalse(CallRetryPolicy.isRetryable(.local))
        XCTAssertFalse(CallRetryPolicy.isRetryable(.remote))
        XCTAssertFalse(CallRetryPolicy.isRetryable(.missed))
        XCTAssertFalse(CallRetryPolicy.isRetryable(.rejected))
    }
}
