import XCTest
@testable import Meeshy

/// Audit fix (2026-08-13): `CallManager` exposed `startSystemPiP()` (a thin
/// `pip.start()` wrapper) but no symmetric `stopSystemPiP()`, even though
/// `PiPCallProviding.stop()` has existed since the system-PiP feature shipped
/// and is already wired for teardown (`detachSystemPiP` → `pip.tearDown()`).
/// Without it, the in-app "enter PiP" control in `CallView` had no way to ask
/// the manager to exit PiP once active — see `CallViewPiPButtonToggleTests`
/// for the button-wiring half of this fix.
@MainActor
final class CallManagerStopSystemPiPTests: XCTestCase {

    private func callManagerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/CallManager.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_stopSystemPiP_methodExists_wrappingPipStop() throws {
        let source = try callManagerSource()
        XCTAssertTrue(
            source.contains("func stopSystemPiP() { pip.stop() }"),
            "CallManager must expose stopSystemPiP() wrapping pip.stop(), symmetric " +
            "with the existing startSystemPiP() wrapping pip.start() — otherwise no " +
            "caller can ever ask an active system PiP session to end short of the " +
            "user dismissing it via the system's own floating-window chrome."
        )
    }

    func test_stopSystemPiP_declaredNearStartSystemPiP() throws {
        // Keep the pair adjacent so the asymmetry can't silently regress again —
        // a future edit that touches one is more likely to notice the other.
        let source = try callManagerSource()
        guard let startRange = source.range(of: "func startSystemPiP() { pip.start() }") else {
            XCTFail("CallManager must declare startSystemPiP()")
            return
        }
        let windowEnd = source.index(startRange.upperBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[startRange.upperBound..<windowEnd])
        XCTAssertTrue(
            vicinity.contains("func stopSystemPiP() { pip.stop() }"),
            "stopSystemPiP() must be declared immediately after startSystemPiP()."
        )
    }
}
