import UIKit
import QuartzCore
import CoreMedia
import MeeshySDK

// MARK: - PHASE 2 STUB
//
// `StoryCanvasUIView` is implemented in Task 2.5 (Phase 2). This stub remains
// only so Phase 0 oracle / equivalence tests that reference the symbol still
// link during incremental builds. All runtime methods fatalError on purpose.
//
// Removed in Task 2.5: this whole file is deleted and replaced by
// `Canvas/StoryCanvasUIView.swift`.

@MainActor
public final class StoryCanvasUIView: UIView {
    public init(slide: StorySlide, mode: RenderMode) {
        super.init(frame: .zero)
        fatalError("Phase 2 not yet implemented — see Task 2.5")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("Phase 2 not yet implemented — see Task 2.5")
    }

    public func setMode(_ mode: RenderMode, time: CMTime) {
        fatalError("Phase 2 not yet implemented — see Task 2.5")
    }
}
