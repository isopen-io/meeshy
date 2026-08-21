import CoreGraphics
import Foundation

/// Pure formatter for the author "reach line" (`@pseudo · 👁 vues · 📊 impressions`),
/// shared by the inline author block (`authorReachLine`) and the collapsed header
/// reveal (`authorRevealView`). Stats are author-only.
///
/// "Vues" = `Post.viewCount` (UNIQUE viewers, deduped 1×/user) — the SAME metric the
/// story viewer shows, so Detail / Reel / Story / Feed all report identical numbers for
/// the same Post (unified 2026-07-14). `postOpenCount` stays server-side for analytics
/// but is no longer the displayed "views" label.
enum PostReachFormatter {
    /// Compact count: 1.2k / 3.4M. Mirrors the per-card `compactCount` copies.
    static func compact(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.1fk", Double(value) / 1_000) }
        return "\(value)"
    }

    struct Components: Equatable {
        let pseudo: String?       // "@marie" or nil
        let views: String?        // "1.2k" or nil (author-only)
        let impressions: String?  // "3.4k" or nil (author-only)
    }

    static func components(username: String?, isAuthor: Bool, viewCount: Int, impressionCount: Int) -> Components {
        let pseudo = username.flatMap { $0.isEmpty ? nil : "@\($0)" }
        guard isAuthor else { return Components(pseudo: pseudo, views: nil, impressions: nil) }
        return Components(pseudo: pseudo, views: compact(viewCount), impressions: compact(impressionCount))
    }
}

/// Pure visibility test for the inline story canvas inside the detail ScrollView.
/// `canvasFrame` is the canvas frame in the named scroll coordinate space
/// (`0` = top of the scroll viewport); `viewportHeight` is the ScrollView's own
/// height. Returns true while ANY part is on-screen (pause audio only once the
/// canvas is FULLY off-screen).
enum StoryCanvasVisibility {
    static func isVisible(canvasFrame: CGRect, viewportHeight: CGFloat) -> Bool {
        canvasFrame.maxY > 0 && canvasFrame.minY < viewportHeight
    }
}

/// Pure mute/pause policy for the inline story canvas in PostDetailView, shared by
/// BOTH the native story canvas and the STORY-repost canvas so the two paths can't
/// drift (RF3). The canvas pauses when scrolled fully off-screen OR while a call
/// owns the audio session. Audio is ON by DEFAULT in detail (`isCanvasMuted`
/// starts `false`) — the detail viewer matches the native story experience,
/// unlike the muted feed. A local mute toggle in the actions bar (B3.6,
/// Task E2) lets the viewer silence it; this policy only governs PAUSE, never
/// that mute state. The toggle itself is gated on a canvas actually being
/// rendered (`BackgroundSoundBadge.detailCanvasIsRendered`, E2 DoD correctif
/// rev.14) — a plain non-story post carrying its own background sound never
/// mounts one, since no canvas plays here for it to control.
enum StoryDetailPlaybackPolicy {
    static func isPaused(visible: Bool, callActive: Bool) -> Bool {
        !visible || callActive
    }
}
