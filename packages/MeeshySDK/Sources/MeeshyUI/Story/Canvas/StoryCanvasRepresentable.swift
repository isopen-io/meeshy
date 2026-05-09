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

/// SwiftUI wrapper around `StoryCanvasUIView` for embedded composer use.
///
/// Unlike `StoryComposerRepresentable` (which embeds the full `StoryComposerVC`
/// with its dev-time Edit/Play segmented control + safe-area constraints), this
/// representable wraps the bare `StoryCanvasUIView` so the SwiftUI composer can
/// supply its own top bar, bottom toolbars, and viewport scaling.
///
/// Replaces the legacy `StoryCanvasView` SwiftUI canvas in `StoryComposerView`.
public struct StoryComposerCanvasView: UIViewRepresentable {
    @Binding public var slide: StorySlide
    public var onItemDoubleTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?

    public init(slide: Binding<StorySlide>,
                onItemDoubleTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil) {
        self._slide = slide
        self.onItemDoubleTapped = onItemDoubleTapped
    }

    public func makeUIView(context: Context) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.onItemModified = { modified in
            DispatchQueue.main.async { self.slide = modified }
        }
        view.onItemDoubleTapped = onItemDoubleTapped
        return view
    }

    public func updateUIView(_ uiView: StoryCanvasUIView, context: Context) {
        // Refresh the latest closure on every update so closures captured by
        // the SwiftUI parent see the freshest @State (mutating viewModel,
        // pushing sheets, etc.). This is cheap — just a property assignment.
        uiView.onItemDoubleTapped = onItemDoubleTapped

        // Push outside-driven slide changes (e.g. toolbar mutations of
        // `slide.effects`) into the canvas. Skip identical-id updates that
        // share the same element counts to avoid redundant rebuilds.
        if uiView.slide.id != slide.id || !slidesEqualForCanvas(uiView.slide, slide) {
            uiView.slide = slide
        }
    }

    private func slidesEqualForCanvas(_ a: StorySlide, _ b: StorySlide) -> Bool {
        guard a.id == b.id else { return false }
        if a.effects.textObjects.count != b.effects.textObjects.count { return false }
        if (a.effects.mediaObjects?.count ?? 0) != (b.effects.mediaObjects?.count ?? 0) { return false }
        if (a.effects.stickerObjects?.count ?? 0) != (b.effects.stickerObjects?.count ?? 0) { return false }
        return true
    }
}
