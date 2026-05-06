import XCTest
@testable import MeeshyUI

@MainActor
final class SnapEngineTests: XCTestCase {

    // MARK: - SnapCandidate / SnapResult value semantics

    func test_snapCandidate_init_assignsAllFields() {
        let c = SnapCandidate(kind: .playhead, time: 1.5, label: "playhead")
        XCTAssertEqual(c.kind, .playhead)
        XCTAssertEqual(c.time, 1.5, accuracy: 0.0001)
        XCTAssertEqual(c.label, "playhead")
    }

    func test_snapCandidate_isEquatable_sameFieldsAreEqual() {
        let a = SnapCandidate(kind: .clipStart, time: 2.0, label: "A")
        let b = SnapCandidate(kind: .clipStart, time: 2.0, label: "A")
        XCTAssertEqual(a, b)
    }

    func test_snapCandidate_isEquatable_differentKindAreNotEqual() {
        let a = SnapCandidate(kind: .clipStart, time: 2.0, label: nil)
        let b = SnapCandidate(kind: .clipEnd,   time: 2.0, label: nil)
        XCTAssertNotEqual(a, b)
    }

    func test_snapResult_init_assignsAllFields() {
        let c = SnapCandidate(kind: .gridMajor, time: 1.0, label: nil)
        let r = SnapResult(snappedTime: 1.0, matched: c)
        XCTAssertEqual(r.snappedTime, 1.0, accuracy: 0.0001)
        XCTAssertEqual(r.matched, c)
    }

    // MARK: - SnapEngine init / tolerance

    func test_snapEngine_init_storesTolerance() {
        let engine = SnapEngine(toleranceSeconds: 0.25)
        XCTAssertEqual(engine.toleranceSeconds, 0.25, accuracy: 0.0001)
    }

    func test_snapEngine_init_clampsNegativeToleranceToZero() {
        let engine = SnapEngine(toleranceSeconds: -1.0)
        XCTAssertEqual(engine.toleranceSeconds, 0.0, accuracy: 0.0001)
    }

    func test_snapEngine_isSendable_compileTimeCheck() {
        // Compile-time only: this should compile without warnings.
        let engine = SnapEngine(toleranceSeconds: 0.1)
        let _: any Sendable = engine
        XCTAssertEqual(engine.toleranceSeconds, 0.1, accuracy: 0.0001)
    }

    // MARK: - SnapEngine.snap — disabled

    func test_snap_disabledTrue_returnsRawTime_evenWithCandidatesInRange() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let candidate = SnapCandidate(kind: .playhead, time: 2.0, label: nil)
        let result = engine.snap(rawTime: 2.05, candidates: [candidate], disabled: true)
        XCTAssertEqual(result.snappedTime, 2.05, accuracy: 0.0001)
        XCTAssertNil(result.matched)
    }

    func test_snap_disabledDefaultsToFalse() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let candidate = SnapCandidate(kind: .playhead, time: 2.0, label: nil)
        let result = engine.snap(rawTime: 2.05, candidates: [candidate])
        XCTAssertEqual(result.snappedTime, 2.0, accuracy: 0.0001)
        XCTAssertEqual(result.matched, candidate)
    }

    // MARK: - SnapEngine.snap — empty / out of tolerance

    func test_snap_emptyCandidates_returnsRawTimeUnchanged() {
        let engine = SnapEngine(toleranceSeconds: 1.0)
        let result = engine.snap(rawTime: 3.14, candidates: [])
        XCTAssertEqual(result.snappedTime, 3.14, accuracy: 0.0001)
        XCTAssertNil(result.matched)
    }

    func test_snap_allCandidatesOutOfTolerance_returnsRawTimeUnchanged() {
        let engine = SnapEngine(toleranceSeconds: 0.1)
        let candidates = [
            SnapCandidate(kind: .playhead, time: 0.0, label: nil),
            SnapCandidate(kind: .clipStart, time: 5.0, label: nil)
        ]
        let result = engine.snap(rawTime: 2.5, candidates: candidates)
        XCTAssertEqual(result.snappedTime, 2.5, accuracy: 0.0001)
        XCTAssertNil(result.matched)
    }

    func test_snap_zeroTolerance_onlyExactMatchesSnap() {
        let engine = SnapEngine(toleranceSeconds: 0)
        let candidate = SnapCandidate(kind: .playhead, time: 2.0, label: nil)
        let exact = engine.snap(rawTime: 2.0, candidates: [candidate])
        let nearMiss = engine.snap(rawTime: 2.0001, candidates: [candidate])
        XCTAssertEqual(exact.matched, candidate)
        XCTAssertNil(nearMiss.matched)
    }

    // MARK: - SnapEngine.snap — single candidate

    func test_snap_singleCandidateWithinTolerance_snapsAndReturnsMatch() {
        let engine = SnapEngine(toleranceSeconds: 0.5)
        let candidate = SnapCandidate(kind: .clipEnd, time: 3.0, label: "clipA end")
        let result = engine.snap(rawTime: 3.2, candidates: [candidate])
        XCTAssertEqual(result.snappedTime, 3.0, accuracy: 0.0001)
        XCTAssertEqual(result.matched, candidate)
    }

    func test_snap_singleCandidateAtToleranceBoundary_snaps() {
        let engine = SnapEngine(toleranceSeconds: 0.5)
        let candidate = SnapCandidate(kind: .clipEnd, time: 3.0, label: nil)
        // |2.5 - 3.0| == 0.5, exactly at the boundary
        let result = engine.snap(rawTime: 2.5, candidates: [candidate])
        XCTAssertEqual(result.snappedTime, 3.0, accuracy: 0.0001)
        XCTAssertEqual(result.matched, candidate)
    }
}
