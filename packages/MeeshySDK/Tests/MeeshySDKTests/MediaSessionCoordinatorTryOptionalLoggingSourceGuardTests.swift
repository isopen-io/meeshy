import XCTest
@testable import MeeshySDK

/// Guards the `try?`→`do/catch`+logging conversion in `MediaSessionCoordinator.swift`
/// (iOS-debt routine). `setCategory`/`setActive` on the shared `AVAudioSession` are real
/// system calls that CAN fail (another process holding exclusive hardware, a routing
/// conflict) — swallowing that failure via `try?` left every audio-session activation
/// bug in this coordinator completely undiagnosable. Source-guard rather than a
/// behavioural test: there is no seam to make the real `AVAudioSession` throw in a unit
/// test, so this pins the SHAPE of the fix instead (mirrors
/// `CameraModelSwitchDuringRecordingTests`'s established pattern for the same category).
final class MediaSessionCoordinatorTryOptionalLoggingSourceGuardTests: XCTestCase {

    private func coordinatorSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // this test file
            .deletingLastPathComponent() // MeeshySDKTests/
            .deletingLastPathComponent() // Tests/
            .appendingPathComponent("Sources/MeeshySDK/MediaSessionCoordinator.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(from startMarker: String, to endMarker: String, in source: String) throws -> String {
        guard let start = source.range(of: startMarker) else {
            XCTFail("Marker not found: \(startMarker)"); throw XCTSkip()
        }
        let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex)?.lowerBound ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_activatePlaybackSync_logsBothFailuresIndependentlyInsteadOfSwallowing() throws {
        let source = try coordinatorSource()
        let fn = try body(
            from: "public nonisolated func activatePlaybackSync(",
            to: "public nonisolated func activateRecordingSync(",
            in: source,
        )

        XCTAssertFalse(fn.contains("try?"), "activatePlaybackSync must not swallow session errors via try?")
        XCTAssertTrue(fn.contains("setCategory"), "the setCategory call must still be present")
        XCTAssertTrue(fn.contains("setActive(true)"), "the setActive(true) call must still be present")
        // Two independent do/catch blocks, not one wrapping both statements: a
        // setCategory failure must not skip the setActive attempt (that was the
        // try? behaviour — each statement always ran regardless of the other).
        XCTAssertEqual(fn.components(separatedBy: "do {").count - 1, 2,
                       "each throwing call needs its OWN do/catch so a setCategory failure never skips setActive")
        XCTAssertTrue(fn.contains("logger.error"), "a genuine session-activation failure must be logged, not silent")
    }

    func test_deactivatePlaybackSync_logsFailureInsteadOfSwallowing() throws {
        let source = try coordinatorSource()
        let fn = try body(
            from: "public nonisolated func deactivatePlaybackSync() {",
            to: "nonisolated static func shouldManageSession(",
            in: source,
        )

        XCTAssertFalse(fn.contains("try?"), "deactivatePlaybackSync must not swallow session errors via try?")
        XCTAssertTrue(fn.contains("setActive(false"), "the setActive(false) call must still be present")
        XCTAssertTrue(fn.contains("logger.error"), "a genuine deactivation failure must be logged, not silent")
    }

    func test_release_logsFailureInsteadOfSwallowing() throws {
        let source = try coordinatorSource()
        let fn = try body(
            from: "public func release() async {",
            to: "public func deactivateForBackground() async {",
            in: source,
        )

        XCTAssertFalse(fn.contains("try?"), "release() must not swallow session errors via try?")
        XCTAssertTrue(fn.contains("setActive(false"), "the setActive(false) call must still be present")
        XCTAssertTrue(fn.contains("logger.error"), "a genuine release failure must be logged, not silent")
    }

    func test_noTryOptionalRemainsAnywhereInTheFile() throws {
        let source = try coordinatorSource()
        XCTAssertFalse(source.contains("try?"), "MediaSessionCoordinator.swift must have zero remaining try? sites")
    }
}
