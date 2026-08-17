import XCTest

/// Port fidèle du patron `try?` → `removeItemLogging` établi aux runs #12/#13/#14 de la
/// routine dette iOS (`CameraView.swift`, `MediaSessionCoordinator.swift`,
/// `MediaSaveCoordinator.swift`). `MeeshyAudioSignature.stampedCopy` swallowed BOTH the
/// jingle temp-file cleanup and the failed-export directory cleanup via `try?` — real
/// `FileManager.removeItem` calls that CAN fail (permissions, read-only volume), not just
/// the nominal "already gone" case.
///
/// No seam to force a real `FileManager` failure in a portable unit test (same constraint
/// as the three prior runs) — this pins the SHAPE of the fix instead.
final class MeeshyAudioSignatureTryOptionalLoggingSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot
                    .appendingPathComponent("Sources/MeeshyUI/Media/Branding/MeeshyAudioSignature.swift"),
                encoding: .utf8
            )
        )
    }

    func test_stampedCopy_neverUsesTryOptional() throws {
        XCTAssertFalse(
            try source().contains("try?"),
            "stampedCopy must not swallow a real removeItem failure via try?"
        )
    }

    func test_stampedCopy_logsThroughTheSharedFileManagerHelper() throws {
        let code = try source()
        XCTAssertTrue(
            code.contains("removeItemLogging"),
            "must distinguish 'already reclaimed' from a genuine failure via the shared SDK helper"
        )
        // Both call sites — the jingle temp file AND the failed-export directory — must
        // convert, not just one of the two.
        XCTAssertEqual(
            code.components(separatedBy: "removeItemLogging").count - 1, 2,
            "both the jingle cleanup and the failed-export directory cleanup must use the helper"
        )
    }
}
