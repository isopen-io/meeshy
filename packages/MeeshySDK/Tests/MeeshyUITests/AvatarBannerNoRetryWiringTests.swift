import XCTest
@testable import MeeshyUI

/// D2 (ios-full-remediation, Lane AV) — banners and ad hoc avatar chips must
/// never surface `CachedAsyncImage`'s retry button: they already paint an
/// elegant fallback (gradient / initials) that degrades silently on failure.
///
/// `CachedAsyncImage`'s body isn't introspectable without ViewInspector (not
/// a project dependency) — this repo's established pattern for locking
/// SwiftUI wiring is a source-guard: read the actual `.swift` file as text
/// and assert on the call site (cf. `IdentityBarElementTests.sdkSource`,
/// `CallBubbleViewMiniMenuWiringTests` in MeeshyTests). Read the code, not
/// comments — the assertions below anchor on the exact call expression.
@MainActor
final class AvatarBannerNoRetryWiringTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
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

    // MARK: - Banners: showsStatusOverlays: false (existing param, no new
    // SDK API — CachedAsyncImage.swift is owned by a concurrent lane)

    func test_userProfileHeaderBanner_suppressesRetryOverlay() throws {
        let source = try sdkSource("Sources/MeeshyUI/Profile/UserProfileSheet+Header.swift")
        let banner = try block(
            from: "var bannerSection: some View {",
            upTo: "var defaultBannerGradient",
            in: source
        )
        XCTAssertTrue(banner.contains("CachedAsyncImage(url: bannerURL, showsStatusOverlays: false)"),
                      "Profile banner must suppress the retry button — it already renders defaultBannerGradient on failure.")
    }

    func test_communitySettingsBanner_suppressesRetryOverlay() throws {
        let source = try sdkSource("Sources/MeeshyUI/Community/CommunitySettingsView.swift")
        let banner = try block(
            from: "private var communityBannerView: some View {",
            upTo: "private var communityBannerPlaceholder",
            in: source
        )
        XCTAssertTrue(banner.contains("CachedAsyncImage(url: viewModel.bannerUrl, showsStatusOverlays: false)"),
                      "Community banner must suppress the retry button — it already renders communityBannerPlaceholder on failure.")
    }

    func test_conversationSettingsBanner_suppressesRetryOverlay() throws {
        let source = try sdkSource("Sources/MeeshyUI/Conversation/ConversationSettingsView.swift")
        let banner = try block(
            from: "private var bannerView: some View {",
            upTo: "private var bannerPlaceholder",
            in: source
        )
        XCTAssertTrue(banner.contains("CachedAsyncImage(url: viewModel.bannerUrl, showsStatusOverlays: false)"),
                      "Conversation settings banner must suppress the retry button — it already renders bannerPlaceholder on failure.")
    }

    func test_notificationRowPostThumbnail_suppressesRetryOverlay() throws {
        let source = try sdkSource("Sources/MeeshyUI/Notifications/NotificationRowView.swift")
        let thumbnail = try block(
            from: "private func postThumbnail(_ urlString: String) -> some View {",
            upTo: "// MARK: - Timestamp",
            in: source
        )
        XCTAssertTrue(thumbnail.contains("showsStatusOverlays: false"),
                      "Notification post thumbnail (44pt) must suppress the retry button — the icon/text would overflow the rounded thumbnail.")
    }

    // MARK: - Ad hoc avatar: migrate to CachedAvatarImage (silent failure +
    // built-in initials, no SDK edit — CachedAvatarImage already exists)

    func test_videoPlayerAuthorChip_migratesToCachedAvatarImage() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        let chip = try block(
            from: "private func authorChip(_ author: MeeshyVideoPlayer.VideoAuthor) -> some View {",
            upTo: "// MARK: Download overlay",
            in: source
        )
        XCTAssertTrue(chip.contains("CachedAvatarImage("),
                      "authorChip must use CachedAvatarImage — a 24pt chip has no room for the retry icon+label.")
        XCTAssertTrue(chip.contains("name: author.displayName"),
                      "CachedAvatarImage needs a name for its initials fallback.")
        XCTAssertTrue(chip.contains("accentColor: player.accentColor"),
                      "CachedAvatarImage must reuse the player's already-plumbed accentColor (never hardcode a color).")
        XCTAssertFalse(chip.contains("CachedAsyncImage(url: avatarUrl)"),
                       "authorChip must no longer construct a bare CachedAsyncImage for the author avatar.")
    }
}
