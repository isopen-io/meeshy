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

// MARK: - StorySlide + effectiveSlideDuration (Phase 1 oracle stub)
// effectiveSlideDuration() will be fully implemented in Task 1.3.
// This stub exists so SlideDurationLoopTests compiles during Phase 1.

extension StorySlide {
    public nonisolated func effectiveSlideDuration() -> TimeInterval {
        fatalError("Phase 1 not yet implemented — Task 1.3")
    }
}
