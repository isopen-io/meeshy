import XCTest
@testable import MeeshyUI

/// Covers the P1 audit fix: `startPlayback()` and the fullscreen renderer's
/// initial-load `.onAppear` both used to set `manager.attachmentId` BEFORE
/// calling `manager.load(urlString:)` — `load()` calls `cleanup()` internally,
/// which resets `attachmentId` to `nil`, so the value set beforehand was
/// silently wiped and `reportWatchProgress` never fired for these two
/// call sites (conversation bubbles, post detail, comments — the app's
/// most-used video surface). The fix (mirroring
/// `SharedAVPlayerManagerAttachmentTrackingTests` at the manager level) passes
/// `attachmentId` as the `load()` parameter, applied AFTER `cleanup()`.
///
/// `MeeshyVideoPlayer`'s body isn't introspectable without ViewInspector (not
/// a project dependency) — this repo's established pattern for locking
/// SwiftUI wiring is a source-guard: read the actual `.swift` file as text and
/// assert on the call site (cf. `AvatarBannerNoRetryWiringTests`, which already
/// source-guards a DIFFERENT block of this same file). Read the code, not
/// comments — the assertions below anchor on the exact call expression.
@MainActor
final class MeeshyVideoPlayerAttachmentIdWiringTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func block(from startMarker: String, upTo endMarker: String, in source: String) throws -> String {
        guard let start = source.range(of: startMarker) else {
            XCTFail("Marker not found: \(startMarker)")
            return ""
        }
        let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_startPlayback_passesAttachmentIdToLoad_notAsPriorPropertySet() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        let fn = try block(
            from: "private func startPlayback() {",
            upTo: "private func",
            in: source
        )
        XCTAssertTrue(
            fn.contains("manager.load(urlString: player.attachment.fileUrl, attachmentId: player.attachment.id)"),
            "startPlayback() must pass attachmentId as the load() argument (applied after cleanup()) — setting manager.attachmentId before load() is silently wiped."
        )
        XCTAssertFalse(
            fn.contains("manager.attachmentId = player.attachment.id"),
            "startPlayback() must not set manager.attachmentId before calling load() — cleanup() inside load() would wipe it."
        )
    }

    func test_fullscreenInitialLoad_passesAttachmentIdToLoad_notAsPriorPropertySet() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        let onAppear = try block(
            from: "guard !didInitialLoad else { return }",
            upTo: "manager.play()",
            in: source
        )
        XCTAssertTrue(
            onAppear.contains("manager.load(urlString: player.attachment.fileUrl, attachmentId: player.attachment.id)"),
            "The fullscreen renderer's initial-load onAppear must pass attachmentId as the load() argument — setting manager.attachmentId before load() is silently wiped by cleanup()."
        )
        XCTAssertFalse(
            onAppear.contains("manager.attachmentId = player.attachment.id"),
            "The fullscreen renderer's initial-load onAppear must not set manager.attachmentId before calling load()."
        )
    }
}
