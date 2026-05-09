import UIKit
import QuartzCore
import CoreMedia
import MeeshySDK

// MARK: - PHASE 2 STUBS
// These types will be implemented in Phase 2 (Tasks 2.1, 2.5).
// They exist here ONLY so Phase 0 oracle tests compile during Phase 1.
// All runtime methods fatalError — this is intentional.

// MARK: - RenderMode

public nonisolated enum RenderMode: Sendable {
    case edit
    case play
}

// MARK: - StoryRenderer

public nonisolated enum StoryRenderer {
    public static func render(
        slide: StorySlide,
        into geometry: CanvasGeometry,
        at time: CMTime,
        mode: RenderMode
    ) -> CALayer {
        fatalError("Phase 2 not yet implemented")
    }
}

// MARK: - StoryCanvasUIView

@MainActor
public final class StoryCanvasUIView: UIView {
    public init(slide: StorySlide, mode: RenderMode) {
        super.init(frame: .zero)
        fatalError("Phase 2 not yet implemented")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("Phase 2 not yet implemented")
    }

    public func setMode(_ mode: RenderMode, time: CMTime) {
        fatalError("Phase 2 not yet implemented")
    }
}

// MARK: - StorySlide + effectiveSlideDuration (Phase 1 — Task 1.3)
// Returns the slide duration rounded up to the next full loop boundary if
// a background looping video is present; otherwise returns the static base.

extension StorySlide {
    public nonisolated func effectiveSlideDuration() -> TimeInterval {
        let base = duration
        guard let loopMedia = effects.mediaObjects?.first(where: { $0.isBackground && $0.loop }),
              let videoDuration = loopMedia.duration, videoDuration > 0 else {
            return base
        }
        let repetitions = ceil(base / videoDuration)
        return repetitions * videoDuration
    }
}
