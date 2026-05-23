import SwiftUI
import MeeshySDK

/// SwiftUI wrapper around `StoryCanvasUIView` for embedded composer use.
///
/// Wraps the bare `StoryCanvasUIView` so the SwiftUI composer can supply its
/// own top bar, bottom toolbars, and viewport scaling. Replaces the legacy
/// `StoryCanvasView` SwiftUI canvas in `StoryComposerView`.
public struct StoryComposerCanvasView: UIViewRepresentable {
    @Binding public var slide: StorySlide
    public var onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?
    public var onItemDoubleTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?
    public var onItemDuplicated: ((_ oldId: String, _ newId: String, _ kind: StoryCanvasUIView.CanvasItemKind) -> Void)?
    public var editingTextId: String?
    public var onInlineTextChanged: ((String, String) -> Void)?
    public var onInlineTextEditEnded: ((String) -> Void)?
    /// Notifié quand la couche manipulable change (`.canvas` / `.background` /
    /// `.foreground`). Le composer abonne ce callback à un `@State` qui pilote
    /// le `CanvasLayerIndicator` (chip row).
    public var onManipulationLayerChanged: ((CanvasManipulationLayer) -> Void)?
    /// Notifié pendant un pinch à 3 doigts sur le canvas. Pilote
    /// `canvasScale` + l'overlay éphémère `viewportPinchDelta` côté
    /// composer. Le composer applique son propre clamp + commit à `.ended`.
    public var onCanvasZoomScaleChanged: ((CGFloat, UIGestureRecognizer.State) -> Void)?
    public var onBackgroundTapped: (() -> Void)?

    public init(slide: Binding<StorySlide>,
                onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
                onItemDoubleTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
                onItemDuplicated: ((String, String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
                editingTextId: String? = nil,
                onInlineTextChanged: ((String, String) -> Void)? = nil,
                onInlineTextEditEnded: ((String) -> Void)? = nil,
                onManipulationLayerChanged: ((CanvasManipulationLayer) -> Void)? = nil,
                onCanvasZoomScaleChanged: ((CGFloat, UIGestureRecognizer.State) -> Void)? = nil,
                onBackgroundTapped: (() -> Void)? = nil) {
        self._slide = slide
        self.onItemTapped = onItemTapped
        self.onItemDoubleTapped = onItemDoubleTapped
        self.onItemDuplicated = onItemDuplicated
        self.editingTextId = editingTextId
        self.onInlineTextChanged = onInlineTextChanged
        self.onInlineTextEditEnded = onInlineTextEditEnded
        self.onManipulationLayerChanged = onManipulationLayerChanged
        self.onCanvasZoomScaleChanged = onCanvasZoomScaleChanged
        self.onBackgroundTapped = onBackgroundTapped
    }

    public func makeUIView(context: Context) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.onItemModified = { modified in
            DispatchQueue.main.async { self.slide = modified }
        }
        view.onItemTapped = onItemTapped
        view.onItemDoubleTapped = onItemDoubleTapped
        view.onItemDuplicated = onItemDuplicated
        view.onInlineTextChanged = onInlineTextChanged
        view.onInlineTextEditEnded = onInlineTextEditEnded
        view.onManipulationLayerChanged = onManipulationLayerChanged
        view.onCanvasZoomScaleChanged = onCanvasZoomScaleChanged
        view.onBackgroundTapped = onBackgroundTapped
        // Bootstrap : la couche initiale calculée par `init` n'a pas pu être
        // poussée au callback (nil à ce moment). On force l'émission après
        // une frame pour que le chip indicator reflète bien la couche
        // courante dès le premier rendu SwiftUI.
        DispatchQueue.main.async {
            view.emitCurrentManipulationLayer()
        }
        return view
    }

    public func updateUIView(_ uiView: StoryCanvasUIView, context: Context) {
        // Refresh the latest closure on every update so closures captured by
        // the SwiftUI parent see the freshest @State (mutating viewModel,
        // pushing sheets, etc.). This is cheap — just a property assignment.
        uiView.onItemTapped = onItemTapped
        uiView.onItemDoubleTapped = onItemDoubleTapped
        uiView.onItemDuplicated = onItemDuplicated
        uiView.onManipulationLayerChanged = onManipulationLayerChanged
        uiView.onCanvasZoomScaleChanged = onCanvasZoomScaleChanged
        uiView.onBackgroundTapped = onBackgroundTapped
        // Re-emit la couche courante après chaque body eval (deferred via
        // async pour ne pas muter le @State pendant la phase d'update
        // SwiftUI). SwiftUI dédupe les writes égaux côté @State, donc le
        // coût est nul quand la valeur ne change pas. Indispensable parce
        // que le bootstrap async unique du `makeUIView` peut perdre la
        // course avec un premier re-render — et l'indicator restait
        // scotché sur `.canvas` même quand `currentManipulationLayer` était
        // passé à `.foreground` côté UIKit. Cf. spec § 4.4.
        DispatchQueue.main.async { [weak uiView] in
            uiView?.emitCurrentManipulationLayer()
        }

        // Skip de synchronisation pendant un geste actif : UIKit possède la
        // vérité de `slide`, propager une re-écriture parent provoquerait un
        // scintillement et un conflit (cf. spec § 2.5 A.4.c). L'`onItemModified`
        // de fin de geste resync naturellement le parent.
        if uiView.isGestureActive { return }

        // Push outside-driven slide changes (e.g. toolbar mutations of
        // `slide.effects`) into the canvas. Skip pushes when the slide is
        // semantically identical to avoid redundant `rebuildLayers()` calls.
        if !Self.slidesEqualForCanvas(uiView.slide, slide) {
            uiView.slide = slide
        }
        uiView.onInlineTextChanged = onInlineTextChanged
        uiView.onInlineTextEditEnded = onInlineTextEditEnded
        if uiView.inlineEditingTextId != editingTextId {
            if let id = editingTextId {
                uiView.beginInlineTextEdit(textId: id)
            } else {
                uiView.endInlineTextEdit()
            }
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
