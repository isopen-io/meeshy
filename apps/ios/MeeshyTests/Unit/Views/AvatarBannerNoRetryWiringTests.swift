import XCTest
@testable import Meeshy

/// D2 (ios-full-remediation, Lane AV) — banners and ad hoc avatar chips must
/// never surface `CachedAsyncImage`'s retry button: they already paint an
/// elegant fallback (gradient / initials) that degrades silently on failure.
/// This project does not write SwiftUI tap/render-simulation tests (no
/// ViewInspector dependency) — source-guard confirms the wiring itself,
/// matching the established convention (`CallBubbleViewMiniMenuWiringTests`,
/// `CallParticipantVisualTests` in `FloatingCallPillViewTests.swift`). Read
/// the code, not comments.
@MainActor
final class AvatarBannerNoRetryWiringTests: XCTestCase {

    private func appSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
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

    func test_conversationInfoSheetHeroBanner_suppressesRetryOverlay() throws {
        let source = try appSource("Meeshy/Features/Main/Components/ConversationInfoSheet.swift")
        let hero = try block(
            from: "private var heroBannerImage: some View {",
            upTo: "private var heroBannerPlaceholder",
            in: source
        )
        XCTAssertTrue(hero.contains("showsStatusOverlays: false"),
                      "The 140pt hero banner must suppress the retry button — it already renders heroBannerPlaceholder on failure.")
    }

    func test_callParticipantVisualAvatar_migratesToCachedAvatarImage() throws {
        let source = try appSource("Meeshy/Features/Main/Views/CallParticipantVisual.swift")
        let avatar = try block(
            from: "private var avatarView: some View {",
            upTo: "/// Résolution cache-first",
            in: source
        )
        XCTAssertTrue(avatar.contains("CachedAvatarImage("),
                      "avatarView must use CachedAvatarImage — a 44-56pt call circle has no room for the retry icon+label.")
        XCTAssertTrue(avatar.contains("name: callManager.remoteUsername"),
                      "CachedAvatarImage needs a name for its initials fallback.")
        XCTAssertTrue(avatar.contains("accentColor: MeeshyColors.brandPrimaryHex"),
                      "CachedAvatarImage must reuse the documented brand hex constant (never a raw literal).")
        XCTAssertFalse(avatar.contains("CachedAsyncImage("),
                        "avatarView must no longer construct a bare CachedAsyncImage for the remote avatar.")
    }
}
