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
    public var onItemDuplicated: ((_ oldId: String, _ newId: String, _ kind: StoryCanvasUIView.CanvasItemKind) -> Void)?

    public init(slide: Binding<StorySlide>,
                onItemDoubleTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
                onItemDuplicated: ((String, String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil) {
        self._slide = slide
        self.onItemDoubleTapped = onItemDoubleTapped
        self.onItemDuplicated = onItemDuplicated
    }

    public func makeUIView(context: Context) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.onItemModified = { modified in
            DispatchQueue.main.async { self.slide = modified }
        }
        view.onItemDoubleTapped = onItemDoubleTapped
        view.onItemDuplicated = onItemDuplicated
        return view
    }

    public func updateUIView(_ uiView: StoryCanvasUIView, context: Context) {
        // Refresh the latest closure on every update so closures captured by
        // the SwiftUI parent see the freshest @State (mutating viewModel,
        // pushing sheets, etc.). This is cheap — just a property assignment.
        uiView.onItemDoubleTapped = onItemDoubleTapped
        uiView.onItemDuplicated = onItemDuplicated

        // Push outside-driven slide changes (e.g. toolbar mutations of
        // `slide.effects`) into the canvas. Skip pushes when the slide is
        // semantically identical to avoid redundant `rebuildLayers()` calls.
        if !Self.slidesEqualForCanvas(uiView.slide, slide) {
            uiView.slide = slide
        }
    }

    /// Semantic equality used to decide whether to forward a slide change into
    /// `StoryCanvasUIView` (which rebuilds all CALayers via `slide.didSet`).
    ///
    /// The previous heuristic compared only element counts and silently skipped
    /// inline edits — colour, text content, position via slider, rotation,
    /// keyframes, drawing data, filters. We now compare via stable JSON
    /// fingerprints (`.sortedKeys`) so any encoded field flip yields a
    /// different `Data`. `StorySlide.mediaData` is omitted from `CodingKeys`
    /// and therefore intentionally ignored — it is composer ephemeral state
    /// that does not influence canvas rendering.
    ///
    /// On encoding failure (effectively impossible for these Codable structs)
    /// we fall back to "not equal" so the canvas always reflects the latest
    /// state rather than silently dropping a real update.
    internal static func slidesEqualForCanvas(_ a: StorySlide, _ b: StorySlide) -> Bool {
        guard a.id == b.id else { return false }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let lhs = try? encoder.encode(a),
              let rhs = try? encoder.encode(b) else {
            return false
        }
        return lhs == rhs
    }
}
