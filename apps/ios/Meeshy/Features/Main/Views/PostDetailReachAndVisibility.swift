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

    /// Ce que la ligne de portée doit AFFICHER — plus les nombres eux-mêmes.
    ///
    /// Elle a porté `views` / `impressions` sous forme de chaînes déjà abrégées
    /// jusqu'à 239i. Depuis que chaque métrique se rend par `ReachMetricLabel`
    /// — qui doit recevoir le COMPTE, pour pouvoir en dire l'abrégé à l'écran et
    /// la valeur exacte à VoiceOver — ces deux chaînes n'étaient plus lues que
    /// pour leur nullité. Les garder aurait laissé un second chemin de formatage
    /// vivant et non rendu : exactement la branche morte que 238i a trouvée dans
    /// `StatRing`.
    ///
    /// Il reste donc à ce type ce que lui seul décide : le pseudo, et le fait
    /// que les statistiques soient **réservées à l'auteur**.
    struct Components: Equatable {
        let pseudo: String?     // "@marie" or nil
        let showsStats: Bool    // author-only
    }

    static func components(username: String?, isAuthor: Bool) -> Components {
        Components(
            pseudo: username.flatMap { $0.isEmpty ? nil : "@\($0)" },
            showsStats: isAuthor
        )
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
