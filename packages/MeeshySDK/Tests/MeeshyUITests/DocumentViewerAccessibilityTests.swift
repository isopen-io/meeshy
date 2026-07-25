import XCTest
@testable import MeeshyUI

/// B8 item 3 (ios-full-remediation) — DocumentViewerView had 2 destructive
/// delete buttons, a close button, and a download button (11 icons total)
/// with ZERO `accessibilityLabel`. VoiceOver users heard only "button,
/// button, button" with no way to distinguish delete from close from
/// download. Source-guard (cf. `AvatarBannerNoRetryWiringTests`) since
/// `DocumentViewerView`'s body isn't introspectable without ViewInspector.
@MainActor
final class DocumentViewerAccessibilityTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_bothDeleteButtons_haveAccessibilityLabel() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/DocumentViewerView.swift")
        let occurrences = source.components(separatedBy: "media.document.deleteAttachment").count - 1
        XCTAssertEqual(occurrences, 2,
                       "compactCard's AND richCard's delete buttons must each carry the deleteAttachment accessibilityLabel (found \(occurrences)).")
    }

    func test_documentFullSheetCloseButton_hasAccessibilityLabel() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/DocumentViewerView.swift")
        XCTAssertTrue(source.contains("String(localized: \"common.close\", defaultValue: \"Fermer\", bundle: .module)"),
                      "DocumentFullSheet's close button must carry an accessibilityLabel.")
    }

    func test_documentFullSheetDownloadButton_hasAccessibilityLabel() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/DocumentViewerView.swift")
        XCTAssertTrue(source.contains("media.document.download"),
                      "DocumentFullSheet's save/download button must carry an accessibilityLabel.")
    }

    func test_atLeastFourAccessibilityLabelsPresent() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/DocumentViewerView.swift")
        let count = source.components(separatedBy: ".accessibilityLabel(").count - 1
        XCTAssertGreaterThanOrEqual(count, 4,
                       "Expected at least 4 accessibilityLabel call sites: 2 delete buttons, close, download (found \(count)).")
    }
}
