import XCTest
@testable import MeeshySDK

/// IL8 (#11286) — règle pure de choix des victimes sous pression disque.
/// Aucun disque ici : des candidats factices, un espace libre injecté.
final class DiskPressureReclaimPlanTests: XCTestCase {

    private func candidate(_ name: String, ageSeconds: TimeInterval, sizeBytes: Int) -> DiskPressureCandidate {
        DiskPressureCandidate(
            fileName: name,
            modifiedAt: Date(timeIntervalSince1970: 1_000_000 - ageSeconds),
            sizeBytes: sizeBytes
        )
    }

    func test_victims_availableAtTrigger_returnsNothing() {
        let victims = DiskPressureReclaimPlan.victims(
            candidates: [candidate("old", ageSeconds: 100, sizeBytes: 200)],
            availableBytes: DiskPressureReclaimPlan.triggerFreeBytes,
            protectedFileNames: []
        )
        XCTAssertTrue(victims.isEmpty)
    }

    func test_victims_belowTrigger_evictsOldestFirstUntilMarginCovered() {
        let victims = DiskPressureReclaimPlan.victims(
            candidates: [
                candidate("middle", ageSeconds: 200, sizeBytes: 1_000),
                candidate("newest", ageSeconds: 10, sizeBytes: 1_000),
                candidate("oldest", ageSeconds: 300, sizeBytes: 1_000),
            ],
            availableBytes: 500,
            protectedFileNames: [],
            triggerFreeBytes: 1_000,
            targetFreeBytes: 2_000
        )
        XCTAssertEqual(victims.map(\.fileName), ["oldest", "middle"])
    }

    func test_victims_protectedFileIsSkippedAndNextOldestTakesItsPlace() {
        let victims = DiskPressureReclaimPlan.victims(
            candidates: [
                candidate("pinned-oldest", ageSeconds: 300, sizeBytes: 1_000),
                candidate("middle", ageSeconds: 200, sizeBytes: 1_000),
                candidate("newest", ageSeconds: 10, sizeBytes: 1_000),
            ],
            availableBytes: 500,
            protectedFileNames: ["pinned-oldest"],
            triggerFreeBytes: 1_000,
            targetFreeBytes: 2_500
        )
        XCTAssertEqual(victims.map(\.fileName), ["middle", "newest"])
    }

    func test_victims_insufficientEvenWhenEverythingGoes_returnsAllUnprotected() {
        let victims = DiskPressureReclaimPlan.victims(
            candidates: [
                candidate("a", ageSeconds: 200, sizeBytes: 100),
                candidate("b", ageSeconds: 100, sizeBytes: 100),
            ],
            availableBytes: 0,
            protectedFileNames: [],
            triggerFreeBytes: 1_000,
            targetFreeBytes: 2_000
        )
        XCTAssertEqual(victims.map(\.fileName), ["a", "b"])
    }

    func test_victims_noCandidates_returnsNothing() {
        let victims = DiskPressureReclaimPlan.victims(
            candidates: [],
            availableBytes: 0,
            protectedFileNames: []
        )
        XCTAssertTrue(victims.isEmpty)
    }
}
