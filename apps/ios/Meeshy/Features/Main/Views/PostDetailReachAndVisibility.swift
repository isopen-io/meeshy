import CoreGraphics
import Foundation

/// Pure formatter for the author "reach line" (`@pseudo · 👁 vues · 📊 impressions`),
/// shared by the inline author block (`authorReachLine`) and the collapsed header
/// reveal (`authorRevealView`). Stats are author-only.
enum PostReachFormatter {
    /// Compact count: 1.2k / 3.4M. Mirrors the per-card `compactCount` copies.
    static func compact(_ value: Int) -> String {
        MeeshyNumberFormatter.formatCompact(value)
    }

    struct Components: Equatable {
        let pseudo: String?       // "@marie" or nil
        let views: String?        // "1.2k" or nil (author-only)
        let impressions: String?  // "3.4k" or nil (author-only)
    }

    static func components(username: String?, isAuthor: Bool, openCount: Int, impressionCount: Int) -> Components {
        let pseudo = (username?.isEmpty == false) ? "@\(username!)" : nil
        guard isAuthor else { return Components(pseudo: pseudo, views: nil, impressions: nil) }
        return Components(pseudo: pseudo, views: compact(openCount), impressions: compact(impressionCount))
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
