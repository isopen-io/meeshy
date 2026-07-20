import SwiftUI
import UIKit
import MeeshySDK

/// Pont entre les bitmaps édités/foreground du composer (`viewModel.loadedImages`
/// keyés par `media.id`) et l'`ImageCacheReader` consommé par `StoryMediaLayer`.
///
/// Le composer mute `loadedImages[id] = edited` dans son `MeeshyImageEditorView`
/// onAccept. Sans ce pont, le `StoryCanvasUIView` ne voyait que `media.mediaURL`
/// (URL inchangée → `ImageLoader` cache servait l'ancien bitmap) et le canvas
/// principal restait stale après édition. Le mini canvas marchait déjà car
/// `SlideMiniPreview` lit `loadedImages` direct.
///
/// `version` est un cookie monotone que le composer bump à chaque mutation
/// utile pour permettre au `Coordinator` de SwiftUI de déclencher un rebuild
/// canvas — comparer deux dictionnaires `[String: UIImage]` étant impossible
/// (UIImage non Equatable, dict hashable seulement via clés).
struct ComposerImageCacheReader: ImageCacheReader {
    let images: [String: UIImage]
    let version: UInt64

    func cachedImage(for key: String) async -> UIImage? {
        images[key]
    }
}

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
    /// Notifié quand le drag du background se termine (.ended). Le composer
    /// l'utilise pour resynchroniser son cache `viewModel.backgroundTransform`
    /// avec la nouvelle valeur typée. Le `slide` lui-même est déjà mis à jour
    /// via `onItemModified` → `@Binding`, ce callback est complémentaire et
    /// fournit la valeur structurée sans avoir à re-parser le slide.
    public var onBackgroundTransformChanged: ((StoryBackgroundTransform) -> Void)?
    /// Miroir de `viewModel.isCanvasZoomed` du composer. Route le double-tap
    /// fond vers le reset viewport quand le canvas est zoomé (C4).
    public var isViewportZoomed: Bool = false
    /// Demande de reset du zoom viewport (double-tap fond en état zoomé).
    public var onViewportZoomResetRequested: (() -> Void)?
    /// Miroir de `viewModel.isDrawingActive` du composer. Quand `true`, le
    /// canvas supprime son drawingLayer persisté pour éviter le double rendu
    /// avec le PKCanvasView SwiftUI overlay (bug "écrit en double", 2026-05-27).
    public var isDrawingOverlayActive: Bool = false
    /// Side-cache des bitmaps édités/foreground du composer keyé par `media.id`.
    /// Wired vers `StoryCanvasUIView.readerContext.imageCache` via le pont
    /// `ComposerImageCacheReader` pour que le canvas principal reflète les
    /// éditions image (bug 2026-05-27 : main canvas stale après image edit).
    public var loadedImages: [String: UIImage] = [:]
    /// Cookie monotone à bumper côté composer à chaque mutation utile de
    /// `loadedImages` (typiquement l'`onAccept` du `MeeshyImageEditorView`).
    /// Le `Coordinator` compare la valeur reçue à `lastVersionSeen` pour
    /// décider si un rebuild canvas est nécessaire (les dicts UIImage ne sont
    /// pas Equatable).
    public var loadedImagesVersion: UInt64 = 0
    /// URLs locales (file://) des clips audio importés, keyées par `audio.id`
    /// (miroir de `viewModel.loadedAudioURLs`). Wiré vers
    /// `readerContext.localAudioURLResolver` pour que le mixer joue le son en
    /// preview d'édition (directive user 2026-07-14). `postMediaId` étant vide
    /// pour un clip non publié, le resolver par `postMediaId` échouait.
    public var loadedAudioURLs: [String: URL] = [:]
    /// Corner radius applied to the embedded `StoryCanvasUIView`'s backing layer
    /// so the rounded « card » actually clips the CALayer story content. A
    /// SwiftUI `.clipShape` on this representable cannot round the embedded
    /// UIKit CALayer tree, so the radius is plumbed down to the UIView. The
    /// composer passes a scale-compensated value (see `canvasComposerLayer`).
    public var canvasCornerRadius: CGFloat = 0
    /// Preview vivante : le bridge (owné par le composer VM) reçoit une
    /// référence faible vers le `StoryCanvasUIView` créé, pour que les
    /// callbacks playhead du timeline VM poussent directement dans la vue
    /// (aucun body SwiftUI re-évalué à 60 Hz).
    public var timelineBridge: StoryCanvasTimelineBridge?

    public init(slide: Binding<StorySlide>,
                onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
                onItemDoubleTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
                onItemDuplicated: ((String, String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
                editingTextId: String? = nil,
                onInlineTextChanged: ((String, String) -> Void)? = nil,
                onInlineTextEditEnded: ((String) -> Void)? = nil,
                onManipulationLayerChanged: ((CanvasManipulationLayer) -> Void)? = nil,
                onCanvasZoomScaleChanged: ((CGFloat, UIGestureRecognizer.State) -> Void)? = nil,
                onBackgroundTapped: (() -> Void)? = nil,
                onBackgroundTransformChanged: ((StoryBackgroundTransform) -> Void)? = nil,
                isViewportZoomed: Bool = false,
                onViewportZoomResetRequested: (() -> Void)? = nil,
                isDrawingOverlayActive: Bool = false,
                loadedImages: [String: UIImage] = [:],
                loadedImagesVersion: UInt64 = 0,
                loadedAudioURLs: [String: URL] = [:],
                canvasCornerRadius: CGFloat = 0,
                timelineBridge: StoryCanvasTimelineBridge? = nil) {
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
        self.onBackgroundTransformChanged = onBackgroundTransformChanged
        self.isViewportZoomed = isViewportZoomed
        self.onViewportZoomResetRequested = onViewportZoomResetRequested
        self.isDrawingOverlayActive = isDrawingOverlayActive
        self.loadedImages = loadedImages
        self.loadedImagesVersion = loadedImagesVersion
        self.loadedAudioURLs = loadedAudioURLs
        self.canvasCornerRadius = canvasCornerRadius
        self.timelineBridge = timelineBridge
    }

    public final class Coordinator {
        var lastLoadedImagesVersion: UInt64?
        var lastLoadedAudioURLs: [String: URL]?
    }

    /// Construit le `StoryReaderContext` d'édition : pont image (bitmaps édités
    /// keyés `media.id`) + resolver audio local (URLs keyées `audio.id`).
    private func makeComposerContext() -> StoryReaderContext {
        let audioURLs = loadedAudioURLs
        let audioResolver: @Sendable (String) -> URL? = { audioURLs[$0] }
        let reader = ComposerImageCacheReader(images: loadedImages, version: loadedImagesVersion)
        return StoryReaderContext(imageCache: reader, localAudioURLResolver: audioResolver)
    }

    public func makeCoordinator() -> Coordinator { Coordinator() }

    public func makeUIView(context: Context) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        // Live preview : sur le canvas d'édition les vidéos (fond + foreground)
        // jouent et bouclent — la dernière vidéo posée tourne en boucle jusqu'à
        // la suivante. Le prefetcher hors-écran, lui aussi en `.edit`, ne lève
        // jamais ce drapeau et reste silencieux.
        view.playsVideoInEditMode = true
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
        view.onBackgroundTransformChanged = onBackgroundTransformChanged
        view.isViewportZoomed = isViewportZoomed
        view.onViewportZoomResetRequested = onViewportZoomResetRequested
        view.isDrawingOverlayActive = isDrawingOverlayActive
        view.canvasCornerRadius = canvasCornerRadius
        // Wire le pont ImageCacheReader dès la première frame pour que le
        // `StoryRenderer.render(...)` initial (déclenché par le slide.didSet
        // du init StoryCanvasUIView) puisse déjà résoudre les bitmaps
        // foreground via `loadedImages[media.id]`.
        view.setReaderContext(makeComposerContext())
        // Après le context (le resolver audio doit être en place) : opt-in audio
        // d'édition → le mixer joue les clips/voix comme les vidéos.
        view.playsAudioInEditMode = true
        context.coordinator.lastLoadedImagesVersion = loadedImagesVersion
        context.coordinator.lastLoadedAudioURLs = loadedAudioURLs
        timelineBridge?.canvas = view
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
        uiView.onBackgroundTransformChanged = onBackgroundTransformChanged
        uiView.isViewportZoomed = isViewportZoomed
        uiView.onViewportZoomResetRequested = onViewportZoomResetRequested
        uiView.isDrawingOverlayActive = isDrawingOverlayActive
        uiView.canvasCornerRadius = canvasCornerRadius

        // Bridge des bitmaps édités/foreground du composer vers
        // `StoryCanvasUIView.readerContext.imageCache`. On reconstruit le
        // reader UNIQUEMENT quand `loadedImagesVersion` change pour éviter
        // un rebuild par body eval (updateUIView est appelé fréquemment).
        // Le bump de version est piloté par le composer (cf.
        // `MeeshyImageEditorView` onAccept → `viewModel.loadedImagesVersion &+= 1`).
        //
        // `invalidateImageCache()` bump la révision pour forcer le re-stamp
        // des layers du `StoryRendererCache` — cet appel EST réservé au
        // composer ; le reader passe par `setReaderContext` direct qui ne
        // bump plus (sinon ça gèle la progress bar et le canvas reader, cf.
        // régression 2026-05-27).
        // Reconstruit le context quand les bitmaps édités OU les URLs audio
        // locales changent. L'audio doit être à jour AVANT le slice de sync du
        // `slide` plus bas : le `slide.didSet` déclenche `applyEditPlayback` →
        // `reconfigureAudioForPlayback`, qui lit alors le resolver à jour.
        let imageChanged = context.coordinator.lastLoadedImagesVersion != loadedImagesVersion
        let audioChanged = context.coordinator.lastLoadedAudioURLs != loadedAudioURLs
        if imageChanged || audioChanged {
            context.coordinator.lastLoadedImagesVersion = loadedImagesVersion
            context.coordinator.lastLoadedAudioURLs = loadedAudioURLs
            uiView.setReaderContext(makeComposerContext())
            if imageChanged { uiView.invalidateImageCache() }
        }

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
