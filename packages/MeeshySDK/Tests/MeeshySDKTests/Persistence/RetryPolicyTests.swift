import Foundation
import XCTest
@testable import MeeshySDK

final class RetryPolicyTests: XCTestCase {

    private static let failures = Array(1...12)

    func test_messageOutbox_reproducesLegacyFlusherSchedule() {
        let policy = RetryPolicy.messageOutbox
        for n in Self.failures {
            XCTAssertEqual(policy.delay(afterFailure: n, jitterSample: 0), min(30, 2 * pow(2.0, Double(n - 1))), "failure \(n)")
        }
        XCTAssertEqual(policy.delay(afterFailure: 1, jitterSample: 1), 2.5)
        XCTAssertEqual(policy.deferral, 30)
    }

    func test_messageOutbox_exhaustsAtFiveFailures() {
        XCTAssertFalse(RetryPolicy.messageOutbox.isExhausted(afterFailures: 4))
        XCTAssertTrue(RetryPolicy.messageOutbox.isExhausted(afterFailures: 5))
    }

    func test_storyPublish_exhaustsAtFiveFailuresWithoutTimeGate() {
        XCTAssertFalse(RetryPolicy.storyPublish.isExhausted(afterFailures: 4))
        XCTAssertTrue(RetryPolicy.storyPublish.isExhausted(afterFailures: 5))
        XCTAssertEqual(RetryPolicy.storyPublish.delay(afterFailure: 3, jitterSample: 1), 0)
    }

    func test_stateSync_reproducesLegacyEngagementAndConversationStateSchedule() {
        for n in Self.failures {
            XCTAssertEqual(RetryPolicy.stateSync.delay(afterFailure: n, jitterSample: 0.7), min(60, pow(2.0, Double(n)) * 5), "failure \(n)")
        }
        XCTAssertFalse(RetryPolicy.stateSync.isExhausted(afterFailures: 1_000))
    }

    func test_socialEvents_reproducesLegacySchedule() {
        for n in Self.failures {
            XCTAssertEqual(RetryPolicy.socialEvents.delay(afterFailure: n, jitterSample: 0.3), min(300, pow(2.0, Double(n)) * 5), "failure \(n)")
        }
        XCTAssertFalse(RetryPolicy.socialEvents.isExhausted(afterFailures: 1_000))
    }

    func test_delay_neverGoesBelowTheFirstStep() {
        XCTAssertEqual(RetryPolicy.stateSync.delay(afterFailure: 0, jitterSample: 0), 10)
        XCTAssertEqual(RetryPolicy.stateSync.delay(afterFailure: -3, jitterSample: 0), 10)
    }
}

final class RetryPolicyDoublingScheduleTests: XCTestCase {

    func test_delay_withoutJitter_doublesFromFirstDelayUpToTheCap() {
        let policy = RetryPolicy(maxAttempts: nil, firstDelay: 30, maxDelay: 3_600)
        let schedule = (1...10).map { policy.delay(afterFailure: $0, jitterSample: 0.9) }
        XCTAssertEqual(schedule, [30, 60, 120, 240, 480, 960, 1_920, 3_600, 3_600, 3_600])
    }

    func test_delay_withoutJitter_neverExceedsTheCapOnHugeFailureCounts() {
        let policy = RetryPolicy(maxAttempts: nil, firstDelay: 60, maxDelay: 900)
        XCTAssertEqual(policy.delay(afterFailure: 10_000, jitterSample: 0), 900)
    }
}
