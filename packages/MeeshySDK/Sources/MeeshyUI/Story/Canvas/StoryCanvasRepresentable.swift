import SwiftUI
import MeeshySDK

/// SwiftUI wrapper around `StoryCanvasUIView` for embedded composer use.
///
/// Wraps the bare `StoryCanvasUIView` so the SwiftUI composer can supply its
/// own top bar, bottom toolbars, and viewport scaling. Replaces the legacy
/// `StoryCanvasView` SwiftUI canvas in `StoryComposerView`.
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
