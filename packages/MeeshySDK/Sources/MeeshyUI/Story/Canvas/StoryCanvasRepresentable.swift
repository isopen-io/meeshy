import SwiftUI
import MeeshySDK

/// SwiftUI wrapper around `StoryComposerVC`. The bound `slide` updates as the
/// user manipulates items on the canvas (drag/scale/rotate/menu actions).
public struct StoryComposerRepresentable: UIViewControllerRepresentable {
    @Binding public var slide: StorySlide

    public init(slide: Binding<StorySlide>) {
        self._slide = slide
    }

    public func makeUIViewController(context: Context) -> StoryComposerVC {
        let vc = StoryComposerVC(slide: slide)
        vc.onSlideChanged = { newSlide in
            DispatchQueue.main.async { self.slide = newSlide }
        }
        return vc
    }

    public func updateUIViewController(_ uiViewController: StoryComposerVC, context: Context) {
        // Push outside-driven slide changes (e.g. switching to a different
        // slide in a multi-slide composer) into the VC. We intentionally
        // ignore equal-id updates so the canvas isn't rebuilt on every
        // unrelated SwiftUI state mutation.
        guard uiViewController.slide.id != slide.id || !slidesEqual(uiViewController.slide, slide) else {
            return
        }
        uiViewController.updateSlide(slide)
    }

    private func slidesEqual(_ a: StorySlide, _ b: StorySlide) -> Bool {
        // Cheap identity heuristic: same id + same effects element counts.
        guard a.id == b.id else { return false }
        if a.effects.textObjects.count != b.effects.textObjects.count { return false }
        if (a.effects.mediaObjects?.count ?? 0) != (b.effects.mediaObjects?.count ?? 0) { return false }
        if (a.effects.stickerObjects?.count ?? 0) != (b.effects.stickerObjects?.count ?? 0) { return false }
        return true
    }
}

/// SwiftUI wrapper around `StoryViewerVC` (read-only playback).
public struct StoryViewerRepresentable: UIViewControllerRepresentable {
    public let slide: StorySlide

    public init(slide: StorySlide) {
        self.slide = slide
    }

    public func makeUIViewController(context: Context) -> StoryViewerVC {
        StoryViewerVC(slide: slide)
    }

    public func updateUIViewController(_ uiViewController: StoryViewerVC, context: Context) {}
}
