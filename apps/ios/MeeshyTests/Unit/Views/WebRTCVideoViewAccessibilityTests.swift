import XCTest

/// Source-level accessibility/Dynamic-Type guard for `CallVideoView`'s
/// no-video fallback states (WebRTCVideoView.swift). Neither branch had any
/// test coverage before this — a VoiceOver user hit a raw, unlabeled SF
/// Symbol on an unexpected-track-type fallback, and the "no WebRTC" build
/// fallback used a fixed pixel font size instead of a Dynamic Type text style.
final class WebRTCVideoViewAccessibilityTests: XCTestCase {

    private func webRTCVideoViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/WebRTCVideoView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_unexpectedTrackFallback_hasAccessibilityLabel() throws {
        let source = try webRTCVideoViewSource()
        guard let range = source.range(of: "video.slash") else {
            XCTFail("WebRTCVideoView.swift must define the video.slash fallback icon"); return
        }
        let vicinity = String(source[range.lowerBound...].prefix(400))
        XCTAssertTrue(
            vicinity.contains(".accessibilityLabel("),
            "The unexpected-track-type fallback icon is otherwise read by VoiceOver " +
            "as the raw SF Symbol name (\"video slash\") with no context."
        )
    }

    func test_noWebRTCFallback_usesDynamicTypeTextStyle_notFixedFontSize() throws {
        let source = try webRTCVideoViewSource()
        guard let range = source.range(of: "call.video.unavailable") else {
            XCTFail("WebRTCVideoView.swift must define the no-WebRTC fallback text"); return
        }
        let vicinity = String(source[range.lowerBound...].prefix(400))
        XCTAssertFalse(
            vicinity.contains(".font(.system(size:"),
            "The no-WebRTC fallback status text must use a relative Dynamic Type " +
            "text style (e.g. .footnote), not a fixed pixel .system(size:) font."
        )
    }
}
