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
}
