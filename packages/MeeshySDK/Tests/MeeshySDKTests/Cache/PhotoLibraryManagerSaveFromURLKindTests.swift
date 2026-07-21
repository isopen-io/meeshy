import XCTest
@testable import MeeshySDK

/// B8 item 6 (ios-full-remediation) — `PhotoLibraryManager.saveFromURL`
/// decided image vs video by substring-matching the URL
/// (`.contains("video")`, `.contains(".mp4")`) instead of an explicit kind —
/// any URL whose path merely contained one of those substrings could be
/// misclassified. `AttachmentKind` (single source of truth for media family,
/// already used by `MediaSaveRequest.kind` in the app's unified save flow)
/// now drives routing explicitly. Source-guard: `saveFromURL` performs real
/// PhotoKit/network I/O that can't be unit-tested without a live stack.
@MainActor
final class PhotoLibraryManagerSaveFromURLKindTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Cache/
            .deletingLastPathComponent()   // MeeshySDKTests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_saveFromURL_takesExplicitAttachmentKindParameter() throws {
        let source = try sdkSource("Sources/MeeshySDK/Cache/PhotoLibraryManager.swift")
        XCTAssertTrue(source.contains("func saveFromURL(_ urlString: String, kind: AttachmentKind)"),
                      "saveFromURL must take an explicit AttachmentKind parameter.")
    }

    func test_saveFromURL_noLongerSniffsURLSubstrings() throws {
        let source = try sdkSource("Sources/MeeshySDK/Cache/PhotoLibraryManager.swift")
        guard let start = source.range(of: "func saveFromURL") else {
            XCTFail("saveFromURL not found")
            return
        }
        let body = String(source[start.lowerBound...])
        XCTAssertFalse(body.contains(".contains(\"video\")"),
                       "saveFromURL must no longer sniff the URL string for the substring 'video'.")
        XCTAssertFalse(body.contains(".contains(\".mp4\")"),
                       "saveFromURL must no longer sniff the URL string for file extensions.")
    }
}
