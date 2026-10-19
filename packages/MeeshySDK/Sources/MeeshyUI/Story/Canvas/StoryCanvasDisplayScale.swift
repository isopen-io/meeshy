import UIKit

@usableFromInline
enum StoryCanvasDisplayScale {

    nonisolated static func resolved(trait: CGFloat, fallback: CGFloat) -> CGFloat {
        trait > 0 ? trait : max(1, fallback)
    }

    @usableFromInline @MainActor
    static var ambient: CGFloat {
        resolved(trait: UITraitCollection.current.displayScale, fallback: 1)
    }
}

extension UITraitCollection {
    var storyCanvasDisplayScale: CGFloat {
        StoryCanvasDisplayScale.resolved(trait: displayScale, fallback: UITraitCollection.current.displayScale)
    }
}
