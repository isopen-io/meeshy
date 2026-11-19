import XCTest
@testable import MeeshySDK

/// La règle du rapport d'une chute (#18748), sans HealthKit : seuls les échantillons NEUFS et assez récents partent, du
/// plus ancien au plus récent ; un refus faute d'accord arrête l'observateur, une panne réseau garde pour plus tard.
final class FallReportPlannerTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func test_toReport_keepsOnlyNewAndRecentSamples_oldestFirst() {
        let lastReported = now.addingTimeInterval(-600)
        let samples = [now.addingTimeInterval(-60), now.addingTimeInterval(-900), now.addingTimeInterval(-300), lastReported]
        XCTAssertEqual(FallReportPlanner.toReport(samples, lastReported: lastReported, now: now),
                       [now.addingTimeInterval(-300), now.addingTimeInterval(-60)])
    }

    func test_toReport_aSampleOlderThanTheAcceptedAgeIsNeverSent() {
        let samples = [now.addingTimeInterval(-FallDetectionContract.maxReportAge - 1), now.addingTimeInterval(-10)]
        XCTAssertEqual(FallReportPlanner.toReport(samples, lastReported: nil, now: now), [now.addingTimeInterval(-10)])
    }

    func test_next_aRefusalWithoutConsentStopsObserving_offlineRetries_theRestAdvances() {
        XCTAssertEqual(FallReportPlanner.next(after: .consentRequired), .stopObserving)
        XCTAssertEqual(FallReportPlanner.next(after: .failed), .retryLater)
        XCTAssertEqual(FallReportPlanner.next(after: .recorded), .advance)
        XCTAssertEqual(FallReportPlanner.next(after: .deduplicated), .advance)
        XCTAssertEqual(FallReportPlanner.next(after: .rejected), .advance)
    }
}
