import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import PencilKit
import MeeshySDK

// MARK: - Story Canvas Notifications

/// Notification names shared across the story canvas, composer, viewer, and audio player.
/// Previously defined in StoryCanvasReaderView.swift (legacy); moved here after that file
/// was deleted in the Phase A4 reader migration.
public extension Notification.Name {
    /// Posted by the viewer approximately 2 s before the end of a slide to trigger audio fade-out.
    static let storyAudioFadeOut = Notification.Name("storyAudioFadeOut")
    /// Posted by the composer to mute all canvas audio (e.g., while the audio picker is open).
    static let storyComposerMuteCanvas = Notification.Name("storyComposerMuteCanvas")
    /// Posted by the composer to restore canvas audio after muting.
    static let storyComposerUnmuteCanvas = Notification.Name("storyComposerUnmuteCanvas")
    /// Posted by the timeline when playback starts inside the composer.
    static let timelineDidStartPlaying = Notification.Name("timelineDidStartPlaying")
    /// Posted by the timeline when playback stops inside the composer.
    static let timelineDidStopPlaying = Notification.Name("timelineDidStopPlaying")
}

/// The UIKit canvas surface that renders a `StorySlide` and switches between
/// `.edit` (gestures, all items visible, ProMotion 120 Hz) and `.play`
/// (timing-driven playback at 60 Hz with optional 120 Hz wake-up for gestures).
///
/// Internally this view does NOT own its own layout logic for items — it
/// delegates to `StoryRenderer.render(slide:into:at:mode:)`, the single source
/// of rendering shared with `StoryAVCompositor` (Phase 4 export).
///
/// Layer hierarchy:
/// ```
/// view.layer
///  └─ rootLayer            (frame = bounds, anchorPoint = (0,0))
///      ├─ itemsContainer   (per-item layers from StoryRenderer)
///      └─ editOverlayLayer (snap guides, selection markers)
/// ```
public final class StoryCanvasUIView: UIView {

    // MARK: - Public API

    public var slide: StorySlide {
        didSet { rebuildLayers() }
    }
    public private(set) var mode: RenderMode
    public private(set) var currentTime: CMTime = .zero

    // MARK: - Reader context (Task 5)

    private var readerContext: StoryReaderContext = .empty
    private var completionFired: Bool = false

    /// Called whenever a gesture mutates the slide (Tasks 2.7+).
    public var onItemModified: ((StorySlide) -> Void)?

    /// Classifies an item that was hit by a gesture so the parent can route to
    /// the correct editor (text panel vs media editor sheet vs sticker UX).
    public enum CanvasItemKind: Sendable, Equatable {
        case text, media, sticker
    }

    /// Called when the user double-taps an item on the canvas. The parent
    /// composer typically uses this to open the inline text editor or the
    /// media editor sheet (legacy `onEditText` / `onEditMedia` UX parity).
    public var onItemDoubleTapped: ((String, CanvasItemKind) -> Void)?

    /// Fired exactly once per slide rebuild when the background media has
    /// finished loading (image bytes decoded into `contents`, video transitioned
    /// to `.readyToPlay`, or synchronous color/gradient applied). Item layers
    /// are already built by the time `rebuildLayers()` returns, so the
    /// background is the only async gate; once it is settled the slide is
    /// visually complete and the reader's slide-duration timer is safe to
    /// start (see `StoryReaderTimerController`).
    ///
    /// The callback is `@MainActor` because all KVO callbacks below are
    /// dispatched onto the main run loop; using a `nonisolated` closure type
    /// would silently strand the caller off the main actor on Swift 6.
    public var onContentReady: (@MainActor () -> Void)?

    // MARK: - Internal layers

    private let rootLayer = CALayer()
    private let itemsContainer = CALayer()
    private let editOverlayLayer = CALayer()

    /// Background layer (color/gradient/image/video). Inserted at z=0 beneath itemsContainer.
    private let backgroundLayer = StoryBackgroundLayer()

    /// Optional Metal filter overlay (Task 19). Non-nil iff `slide.effects.filter` maps to a
    /// known `StoryFilteredLayer.Kind`. Owned and removed by `updateFilterLayer()`.
    private var filteredLayer: StoryFilteredLayer?

    /// Two-pass backdrop snapshot helper. Drives the MPS path on
    /// `StoryGlassBackdropLayer` by capturing the canvas-minus-glass tree
    /// once per `rebuildLayers()` tick and serving cropped regions to each
    /// glass-text item via the `BackdropProvider` closure. When no glass
    /// items exist on the slide the capture is a no-op (single boolean scan).
    /// See `docs/superpowers/specs/2026-05-12-story-glass-backdrop-snapshot-design.md`.
    private let backdropCapture = StoryBackdropCapture()

    // MARK: - Content readiness tracking

    /// `true` after `onContentReady` has fired for the current background
    /// state. Reset on every slide change (via `slide.didSet` → `rebuildLayers`)
    /// and on every `setReaderContext` so re-keying replays the wait.
    private var contentReadyFired: Bool = false

    /// KVO token watching `backgroundLayer.contentLayer.contents` while an
    /// image background is loading. Held until the real bytes land or the
    /// background is replaced. `NSKeyValueObservation` invalidates on deinit
    /// so there is no manual `invalidate()` requirement on dealloc.
    private var imageContentsObserver: NSKeyValueObservation?

    /// KVO token watching `avPlayer.currentItem.status` while a video
    /// background is preparing. Released when the player reaches
    /// `.readyToPlay` or the background is replaced.
    private var videoStatusObserver: NSKeyValueObservation?

    /// `CGImage` captured the moment the ThumbHash placeholder was assigned
    /// to `backgroundLayer.contentLayer.contents`. Used to distinguish
    /// "still showing the placeholder" from "real bitmap landed" — the
    /// `imageContentsObserver` only fires `onContentReady` once `contents`
    /// transitions to a `CGImage` that is not this reference.
    private weak var thumbHashPlaceholderRef: AnyObject?

    // MARK: - Gestures

    private var panRecognizer: UIPanGestureRecognizer!
    private var pinchRecognizer: UIPinchGestureRecognizer!
    private var rotationRecognizer: UIRotationGestureRecognizer!
    private var doubleTapRecognizer: UITapGestureRecognizer!

    // MARK: - Drawing mode (Phase 3 Task 3.4)

    /// PencilKit drawing surface. Non-nil iff `isDrawingMode == true`.
    private var drawingCanvas: PKCanvasView?

    public private(set) var isDrawingMode: Bool = false

    /// Latest drawing data captured from `drawingCanvas`. The composer VC reads
    /// this on toggle-off and persists it into `slide.effects.drawingData`.
    public var currentDrawingData: Data? {
        drawingCanvas?.drawing.dataRepresentation()
    }

    /// Item currently being dragged/scaled/rotated. Reset on .ended/.cancelled.
    private var manipulatedItemId: String?
    private var dragStartSlideX: Double = 0
    private var dragStartSlideY: Double = 0
    private var baseScale: Double = 1.0
    private var baseRotation: Double = 0.0

    // MARK: - Audio

    /// Sample-accurate foreground+background audio engine for mode `.play`.
    private let audioMixer = ReaderAudioMixer()
    /// Reflects the current mute state driven by `setReaderContext` or
    /// `.storyComposerMuteCanvas` / `.storyComposerUnmuteCanvas` notifications.
    public private(set) var isAudioMuted: Bool = false

    // MARK: - Display link

    /// Drives `currentTime` advance during `.play` mode (preferred 60 Hz, range 60–120).
    private var displayLink: CADisplayLink?

    /// Always-on while in `.edit` and the view is in a window — preferred 120 Hz on
    /// ProMotion devices for buttery gesture transforms (active rendering happens
    /// inside the gesture handlers; this link's tick is a no-op for now and exists
    /// so the display server keeps the high-rate clock running while editing).
    private var editDisplayLink: CADisplayLink?

    // MARK: - Init

    public init(slide: StorySlide, mode: RenderMode = .edit) {
        self.slide = slide
        self.mode = mode
        super.init(frame: .zero)
        layer.addSublayer(rootLayer)
        rootLayer.insertSublayer(backgroundLayer, at: 0)
        rootLayer.addSublayer(itemsContainer)
        rootLayer.addSublayer(editOverlayLayer)
        editOverlayLayer.zPosition = 10_000  // always on top
        backgroundColor = .black
        setupGesturesAll()
        observeAppLifecycle()
        observeMuteNotifications()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @available(*, unavailable)
    public required init?(coder: NSCoder) {
        fatalError("StoryCanvasUIView does not support NSCoder")
    }

    public override var isAccessibilityElement: Bool {
        get { false }
        set {}
    }

    public override var accessibilityElements: [Any]? {
        get { synthesizedAccessibilityElements() }
        set {}
    }

    private func synthesizedAccessibilityElements() -> [Any]? {
        switch mode {
        case .edit:
            return editAccessibilityElements()
        case .play:
            return playAccessibilityElements()
        }
    }

    private func editAccessibilityElements() -> [UIAccessibilityElement] {
        var elements: [UIAccessibilityElement] = []
        for txt in slide.effects.textObjects {
            elements.append(makeAccessibilityElement(
                label: "Texte : \(txt.text)",
                traits: .staticText,
                id: txt.id,
                allowCustomActions: true
            ))
        }
        for media in slide.effects.mediaObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo" : "Image",
                traits: .image,
                id: media.id,
                allowCustomActions: true
            ))
        }
        for sticker in slide.effects.stickerObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: "Sticker \(sticker.emoji)",
                traits: .image,
                id: sticker.id,
                allowCustomActions: true
            ))
        }
        return elements
    }

    /// Builds VoiceOver elements for `.play` (reader) mode.
    ///
    /// Prisme Linguistique : `StoryTextObject.resolvedText(preferredLanguages:)`
    /// is used so the spoken label matches the language the user sees
    /// (`systemLanguage` > `regionalLanguage` > `customDestinationLanguage`).
    /// Background media is announced explicitly ("Photo de fond" / "Vidéo de fond")
    /// because it covers the full canvas and would otherwise be invisible
    /// to VoiceOver. Custom destructive actions (delete/duplicate/back) are
    /// suppressed in `.play` — they only make sense while composing.
    private func playAccessibilityElements() -> [UIAccessibilityElement] {
        let languages = readerContext.preferredLanguages
        var elements: [UIAccessibilityElement] = []
        for media in slide.effects.mediaObjects ?? [] where media.isBackground {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo de fond" : "Photo de fond",
                traits: .image,
                id: media.id,
                allowCustomActions: false
            ))
        }
        for txt in slide.effects.textObjects {
            let resolved = txt.resolvedText(preferredLanguages: languages)
            elements.append(makeAccessibilityElement(
                label: resolved,
                traits: .staticText,
                id: txt.id,
                allowCustomActions: false
            ))
        }
        for media in slide.effects.mediaObjects ?? [] where !media.isBackground {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo" : "Image",
                traits: .image,
                id: media.id,
                allowCustomActions: false
            ))
        }
        for sticker in slide.effects.stickerObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: stickerAccessibilityLabel(for: sticker),
                traits: .image,
                id: sticker.id,
                allowCustomActions: false
            ))
        }
        return elements
    }

    private func makeAccessibilityElement(label: String,
                                          traits: UIAccessibilityTraits,
                                          id: String,
                                          allowCustomActions: Bool) -> UIAccessibilityElement {
        let el = UIAccessibilityElement(accessibilityContainer: self)
        el.accessibilityLabel = label
        el.accessibilityTraits = traits
        el.accessibilityFrameInContainerSpace = accessibilityFrame(forId: id)
        if allowCustomActions {
            el.accessibilityCustomActions = makeCustomActions(forId: id)
        }
        return el
    }

    /// Returns the frame the accessibility element should occupy, in this
    /// view's container space.
    ///
    /// Strategy:
    /// 1. Prefer the live `CALayer` frame on `itemsContainer` (set by the
    ///    renderer during `rebuildLayers()`). This is the most accurate frame
    ///    once layers exist.
    /// 2. Fall back to projecting the design-space position of the item
    ///    through `CanvasGeometry.render(_:)` when no layer is present yet
    ///    (e.g. when VoiceOver queries before the first layout pass).
    /// 3. Default to `.zero` when the item id is unknown.
    private func accessibilityFrame(forId id: String) -> CGRect {
        if let layerFrame = itemsContainer.sublayers?.first(where: { $0.name == id })?.frame,
           layerFrame != .zero {
            return layerFrame
        }
        return projectedDesignFrame(forId: id) ?? .zero
    }

    /// Returns a coarse render-space frame computed from the item's normalised
    /// (0–1) position via `CanvasGeometry.render(_:)`. Used as a fallback when
    /// the CALayer hasn't been built yet so VoiceOver focus is still located
    /// roughly where the item will appear.
    private func projectedDesignFrame(forId id: String) -> CGRect? {
        let g = geometry
        guard g.renderSize.width > 0 else { return nil }
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) {
            let designSize = CGSize(
                width: CGFloat(t.fontSize) * CGFloat(max(t.scale, 0.1)) * 6,
                height: CGFloat(t.fontSize) * CGFloat(max(t.scale, 0.1)) * 1.4
            )
            return centeredFrame(normalizedX: CGFloat(t.x),
                                 normalizedY: CGFloat(t.y),
                                 designSize: designSize,
                                 geometry: g)
        }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            if m.isBackground {
                return CGRect(origin: .zero, size: g.renderSize)
            }
            let side: CGFloat = 540
            let designSize = CGSize(width: side * CGFloat(m.scale),
                                    height: side * CGFloat(m.scale) / CGFloat(max(m.aspectRatio, 0.01)))
            return centeredFrame(normalizedX: CGFloat(m.x),
                                 normalizedY: CGFloat(m.y),
                                 designSize: designSize,
                                 geometry: g)
        }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) {
            let side = CGFloat(s.baseSize) * CGFloat(max(s.scale, 0.1))
            return centeredFrame(normalizedX: CGFloat(s.x),
                                 normalizedY: CGFloat(s.y),
                                 designSize: CGSize(width: side, height: side),
                                 geometry: g)
        }
        return nil
    }

    private func centeredFrame(normalizedX nx: CGFloat,
                               normalizedY ny: CGFloat,
                               designSize: CGSize,
                               geometry g: CanvasGeometry) -> CGRect {
        let designCenter = g.designPoint(forNormalized: CGPoint(x: nx, y: ny))
        let designOrigin = CGPoint(x: designCenter.x - designSize.width / 2,
                                   y: designCenter.y - designSize.height / 2)
        let renderOrigin = g.render(designOrigin)
        let renderSize = g.render(designSize)
        return CGRect(origin: renderOrigin, size: renderSize)
    }

    /// Heuristic VoiceOver label for a sticker.
    ///
    /// `StorySticker.emoji` may be either a literal emoji glyph or, for
    /// custom-image stickers, an asset identifier. We use the Unicode
    /// "Name" property to provide a localized name when present (e.g. "🔥"
    /// → "Fire"); otherwise we fall back to "Sticker".
    private func stickerAccessibilityLabel(for sticker: StorySticker) -> String {
        let emoji = sticker.emoji
        if !emoji.isEmpty,
           let scalar = emoji.unicodeScalars.first,
           let name = scalar.properties.nameAlias ?? scalar.properties.name,
           !name.isEmpty {
            return "Sticker \(name.capitalized)"
        }
        return "Sticker"
    }

    private func makeCustomActions(forId id: String) -> [UIAccessibilityCustomAction] {
        [
            UIAccessibilityCustomAction(name: "Supprimer") { [weak self] _ in
                self?.deleteItem(id: id)
                return true
            },
            UIAccessibilityCustomAction(name: "Dupliquer") { [weak self] _ in
                self?.duplicateItem(id: id)
                return true
            },
            UIAccessibilityCustomAction(name: "Mettre à l'arrière") { [weak self] _ in
                self?.sendToBack(id: id)
                return true
            },
        ]
    }

    // MARK: - Layout

    public override func layoutSubviews() {
        super.layoutSubviews()
        rootLayer.frame = bounds
        itemsContainer.frame = bounds
        editOverlayLayer.frame = bounds
        rebuildLayers()
    }

    /// `CanvasGeometry` derived from the current bounds. Tests, `StoryRenderer`,
    /// gestures and `StoryAVCompositor` all consume this as the single source
    /// of design→render projection.
    public var geometry: CanvasGeometry {
        CanvasGeometry(renderSize: bounds.size)
    }

    // MARK: - Mode switching

    /// Enables or disables PencilKit drawing on top of the canvas. While drawing
    /// is enabled, item gestures (pan/pinch/rotation) are suspended so PKCanvasView
    /// can capture every touch. The composer VC is responsible for reading
    /// `currentDrawingData` on toggle-off and writing it into the slide model.
    /// Re-enabling the mode restores the previous strokes from
    /// `slide.effects.drawingData`.
    public func setDrawingMode(_ enabled: Bool, tool: PKTool? = nil) {
        guard isDrawingMode != enabled else { return }
        isDrawingMode = enabled

        panRecognizer.isEnabled = !enabled
        pinchRecognizer.isEnabled = !enabled
        rotationRecognizer.isEnabled = !enabled

        if enabled {
            let canvas = PKCanvasView(frame: bounds)
            canvas.drawingPolicy = .anyInput
            canvas.tool = tool ?? PKInkingTool(.pen, color: .systemPink, width: 4)
            canvas.backgroundColor = .clear
            canvas.isOpaque = false
            canvas.translatesAutoresizingMaskIntoConstraints = false
            // Restore prior strokes if any so re-entering drawing mode picks
            // up where the user left off.
            if let data = slide.effects.drawingData,
               let drawing = try? PKDrawing(data: data) {
                canvas.drawing = drawing
            }
            addSubview(canvas)
            NSLayoutConstraint.activate([
                canvas.topAnchor.constraint(equalTo: topAnchor),
                canvas.leadingAnchor.constraint(equalTo: leadingAnchor),
                canvas.trailingAnchor.constraint(equalTo: trailingAnchor),
                canvas.bottomAnchor.constraint(equalTo: bottomAnchor),
            ])
            drawingCanvas = canvas
        } else {
            drawingCanvas?.removeFromSuperview()
            drawingCanvas = nil
        }
    }

    /// Injects runtime params for mode `.play` reader playback (Prisme Linguistique,
    /// mute state, completion callback). Idempotent — safe to call from `updateUIView`.
    public func setReaderContext(_ context: StoryReaderContext) {
        readerContext = context
        isAudioMuted = context.mute
        audioMixer.setMute(context.mute)
        rebuildLayers()
    }

    public func setMode(_ newMode: RenderMode, time: CMTime = .zero) {
        let wasPlay = mode == .play
        let didChange = mode != newMode
        mode = newMode
        currentTime = time
        if newMode == .play {
            completionFired = false
        }
        rebuildLayers()
        // Apply slide opening animation when transitioning edit→play at t=0.
        // Runs after rebuildLayers() so the layer tree is fresh.
        if newMode == .play && !wasPlay {
            StoryRenderer.applyOpening(slide.effects.opening,
                                       rootLayer: rootLayer,
                                       elapsed: time.seconds)
        }
        if didChange {
            switch newMode {
            case .play:
                stopEditDisplayLink()
                startPlayback()
                try? audioMixer.play()
            case .edit:
                stopPlayback()
                audioMixer.pause()
                startEditDisplayLinkIfNeeded()
            }
        }
    }

    // MARK: - Rendering

    private func rebuildLayers() {
        guard bounds.size != .zero else { return }
        // CATransaction with disableActions avoids implicit fade animations on
        // every rebuild — important for a smooth ~60 Hz playback loop.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        // Background layer
        let bgKind = StoryRenderer.renderBackground(slide: slide,
                                                    languages: readerContext.preferredLanguages)
        let bgTransform: BackgroundTransform = {
            guard let t = slide.effects.backgroundTransform else { return .identity }
            return BackgroundTransform(scale: Double(t.scale ?? 1),
                                       offsetX: Double(t.offsetX ?? 0),
                                       offsetY: Double(t.offsetY ?? 0),
                                       rotation: t.rotation ?? 0)
        }()
        backgroundLayer.frame = CGRect(origin: .zero, size: geometry.renderSize)
        backgroundLayer.configure(
            kind: bgKind,
            transform: bgTransform,
            geometry: geometry,
            resolver: readerContext.postMediaURLResolver,
            imageCache: readerContext.imageCache
        )

        // Items
        itemsContainer.sublayers?.forEach { $0.removeFromSuperlayer() }

        // Drop the stale canvas backdrop captured during the previous tick,
        // then re-capture against the current slide state. The helper short-
        // circuits to a no-op when no glass-style text exists on the slide,
        // so this is essentially free for the common path.
        backdropCapture.invalidate()
        _ = backdropCapture.captureCanvasBackdrop(slide: slide,
                                                  geometry: geometry,
                                                  time: currentTime,
                                                  mode: mode,
                                                  languages: readerContext.preferredLanguages)

        let rendered = StoryRenderer.render(slide: slide,
                                            into: geometry,
                                            at: currentTime,
                                            mode: mode,
                                            languages: readerContext.preferredLanguages,
                                            backdropProvider: { [weak backdropCapture] frame in
                                                backdropCapture?.cropRegion(frame)
                                            })
        for sub in rendered.sublayers ?? [] {
            itemsContainer.addSublayer(sub)
        }

        updateFilterLayer()
        scheduleContentReadyEvaluation(for: bgKind)
    }

    /// Inserts, updates, or removes the `StoryFilteredLayer` overlay driven by
    /// `slide.effects.filter` + `slide.effects.filterIntensity`.
    private func updateFilterLayer() {
        guard let raw = slide.effects.filter,
              let kind = StoryFilteredLayer.Kind(rawValue: raw) else {
            filteredLayer?.removeFromSuperlayer()
            filteredLayer = nil
            return
        }
        let intensity = Float(slide.effects.filterIntensity ?? 1.0)
        if filteredLayer == nil {
            let l = StoryFilteredLayer()
            rootLayer.addSublayer(l)
            filteredLayer = l
        }
        filteredLayer?.frame = CGRect(origin: .zero, size: geometry.renderSize)
        filteredLayer?.kind = kind
        filteredLayer?.intensity = intensity
    }

    // MARK: - Content readiness (drives StoryReaderTimerController)

    /// Decides when the background media for the current slide is fully
    /// usable on screen and fires `onContentReady` exactly once per
    /// `rebuildLayers()` cycle. Behaviour per `Kind`:
    ///
    /// - `.solidColor`, `.gradient` : ready immediately (synchronous draw).
    ///   We post the callback through the next runloop tick to mirror the
    ///   async paths and keep the contract observable from a single test
    ///   `XCTestExpectation`.
    /// - `.image` : `StoryBackgroundLayer.configure(...)` writes a ThumbHash
    ///   placeholder synchronously, then `Task`-fetches the real bitmap and
    ///   reassigns `contentLayer.contents`. We KVO-observe that property and
    ///   fire when contents transitions from `nil`/`placeholder` to a real
    ///   `CGImage`. A nil ThumbHash + first contents arrival also counts.
    /// - `.video` : KVO `avPlayer.currentItem.status` and fire on
    ///   `.readyToPlay`. If the player is already ready at observation time
    ///   we fire on the next runloop tick.
    ///
    /// The observers are torn down on every entry so they cannot stack across
    /// slides (slide swipe in the reader rebuilds layers on every keyframe).
    private func scheduleContentReadyEvaluation(for kind: StoryBackgroundLayer.Kind) {
        contentReadyFired = false
        teardownReadinessObservers()

        switch kind {
        case .solidColor, .gradient:
            // No async work — yield to the next runloop tick so the caller
            // can attach `onContentReady` after `rebuildLayers()` returns
            // (the prefetcher attaches the callback right after init).
            DispatchQueue.main.async { [weak self] in
                self?.fireContentReadyIfNeeded()
            }
        case .image:
            thumbHashPlaceholderRef = backgroundLayer.contentLayer?.contents.map { $0 as AnyObject }
            // If the real bytes already landed synchronously (warm L1 cache),
            // we still want to honor the contract: fire on the next runloop
            // tick when no observable transition is pending.
            if let layer = backgroundLayer.contentLayer {
                imageContentsObserver = layer.observe(\.contents, options: [.new]) { [weak self] _, change in
                    // Convert the new contents to a Sendable `ObjectIdentifier`
                    // inside the KVO callback. AnyObject is non-Sendable so we
                    // cannot ship it across the actor hop, but ObjectIdentifier
                    // (a UInt wrapper) is Sendable and gives us the reference-
                    // equality semantics we need to distinguish the ThumbHash
                    // placeholder from the real loaded CGImage.
                    let newAny: Any? = change.newValue.flatMap { $0 }
                    let snapshotID: ObjectIdentifier? = (newAny as AnyObject?).map { ObjectIdentifier($0) }
                    Task { @MainActor in
                        guard let self else { return }
                        guard let snapshotID else { return }
                        // Fire only once the new contents differ from the
                        // ThumbHash placeholder reference. A nil placeholder
                        // (no thumbHash on the slide) makes the first non-nil
                        // assignment the trigger.
                        let placeholderID = self.thumbHashPlaceholderRef.map { ObjectIdentifier($0) }
                        if let placeholderID, snapshotID == placeholderID { return }
                        self.fireContentReadyIfNeeded()
                    }
                }
            } else {
                // Defensive — no contentLayer means the kind switch already
                // settled (e.g. solidColor path took precedence). Fire async
                // so the contract still observes a single trailing-edge tick.
                DispatchQueue.main.async { [weak self] in
                    self?.fireContentReadyIfNeeded()
                }
            }
        case .video:
            if let item = backgroundLayer.avPlayer?.currentItem {
                if item.status == .readyToPlay {
                    DispatchQueue.main.async { [weak self] in
                        self?.fireContentReadyIfNeeded()
                    }
                } else {
                    videoStatusObserver = item.observe(\.status, options: [.new]) { [weak self] observed, _ in
                        guard observed.status == .readyToPlay else { return }
                        Task { @MainActor in
                            self?.fireContentReadyIfNeeded()
                        }
                    }
                }
            }
        }
    }

    private func fireContentReadyIfNeeded() {
        guard !contentReadyFired else { return }
        contentReadyFired = true
        onContentReady?()
    }

    private func teardownReadinessObservers() {
        imageContentsObserver?.invalidate()
        imageContentsObserver = nil
        videoStatusObserver?.invalidate()
        videoStatusObserver = nil
        thumbHashPlaceholderRef = nil
    }

    /// Test-only seam : forces the readiness signal as if the background
    /// media had finished loading. Lets unit tests exercise the timer-gating
    /// contract on `StoryReaderTimerController` without staging a real
    /// `URLSession` fetch or `AVPlayer` status transition.
    public func _forceContentReadyForTesting() {
        fireContentReadyIfNeeded()
    }

    // MARK: - Window lifecycle

    public override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            startEditDisplayLinkIfNeeded()
        } else {
            stopEditDisplayLink()
        }
    }

    public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        // Stage Manager / Split View on iPad can change horizontal/vertical
        // size classes without bounds changing; force a rebuild defensively.
        rebuildLayers()
    }

    // MARK: - App lifecycle (UIScene-aware)

    private func observeAppLifecycle() {
        let nc = NotificationCenter.default
        nc.addObserver(self,
                       selector: #selector(handleWillResignActive),
                       name: UIApplication.willResignActiveNotification,
                       object: nil)
        nc.addObserver(self,
                       selector: #selector(handleDidBecomeActive),
                       name: UIApplication.didBecomeActiveNotification,
                       object: nil)
    }

    private func observeMuteNotifications() {
        let nc = NotificationCenter.default
        nc.addObserver(self,
                       selector: #selector(handleComposerMute),
                       name: .storyComposerMuteCanvas,
                       object: nil)
        nc.addObserver(self,
                       selector: #selector(handleComposerUnmute),
                       name: .storyComposerUnmuteCanvas,
                       object: nil)
    }

    @objc private func handleComposerMute() {
        isAudioMuted = true
        audioMixer.setMute(true)
    }

    @objc private func handleComposerUnmute() {
        isAudioMuted = false
        audioMixer.setMute(false)
    }

    @objc private func handleWillResignActive() {
        forEachAVPlayer { $0.pause() }
        backgroundLayer.handleAppLifecycle(active: false)
    }

    @objc private func handleDidBecomeActive() {
        guard mode == .play else { return }
        forEachAVPlayer { $0.play() }
        backgroundLayer.handleAppLifecycle(active: true)
    }

    private func forEachAVPlayer(_ block: (AVPlayer) -> Void) {
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer, let player = media.avPlayer {
                block(player)
            }
        }
    }

    // MARK: - Playback (CADisplayLink)

    private func startPlayback() {
        stopPlayback()
        let link = CADisplayLink(target: self, selector: #selector(displayLinkTick))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 60)
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    private func stopPlayback() {
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func displayLinkTick(_ link: CADisplayLink) {
        let dt = link.targetTimestamp - link.timestamp
        let nextSeconds = CMTimeGetSeconds(currentTime) + dt
        let effectiveDuration = slide.effectiveSlideDuration()
        let clamped = min(nextSeconds, effectiveDuration)
        currentTime = CMTime(seconds: clamped, preferredTimescale: 600_000)
        rebuildLayers()
        if clamped >= effectiveDuration {
            stopPlayback()
            if !completionFired {
                completionFired = true
                readerContext.onCompletion?()
            }
        }
    }

    /// Test-only seam: simulate a displayLink tick at a specific timestamp
    /// to validate completion logic without spinning a real CADisplayLink.
    public func simulateTickAt(seconds: Double) {
        let effectiveDuration = slide.effectiveSlideDuration()
        currentTime = CMTime(seconds: seconds, preferredTimescale: 600_000)
        rebuildLayers()
        if !completionFired,
           mode == .play,
           currentTime.seconds >= effectiveDuration {
            completionFired = true
            readerContext.onCompletion?()
        }
    }

    // MARK: - ProMotion edit-mode link

    private func startEditDisplayLinkIfNeeded() {
        guard mode == .edit, editDisplayLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(editTick))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        editDisplayLink = link
    }

    private func stopEditDisplayLink() {
        editDisplayLink?.invalidate()
        editDisplayLink = nil
    }

    @objc private func editTick(_ link: CADisplayLink) {
        // Gesture handlers (Tasks 2.7-2.8) drive their own rebuilds; this tick
        // exists to keep the 120 Hz clock alive on ProMotion while editing.
    }

    // MARK: - Gesture wiring

    private func setupGesturesAll() {
        panRecognizer = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pinchRecognizer = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        rotationRecognizer = UIRotationGestureRecognizer(target: self, action: #selector(handleRotation(_:)))
        doubleTapRecognizer = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
        doubleTapRecognizer.numberOfTapsRequired = 2
        for recognizer: UIGestureRecognizer in [panRecognizer, pinchRecognizer, rotationRecognizer, doubleTapRecognizer] {
            recognizer.delegate = self
            addGestureRecognizer(recognizer)
        }
        addInteraction(UIPointerInteraction(delegate: self))
        addInteraction(UIContextMenuInteraction(delegate: self))
    }

    @objc private func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
        guard mode == .edit, recognizer.state == .ended else { return }
        let location = recognizer.location(in: self)
        guard let id = hitTestItem(at: location), let kind = itemKind(forId: id) else { return }
        onItemDoubleTapped?(id, kind)
    }

    private func itemKind(forId id: String) -> CanvasItemKind? {
        if slide.effects.textObjects.contains(where: { $0.id == id }) { return .text }
        if (slide.effects.mediaObjects ?? []).contains(where: { $0.id == id }) { return .media }
        if (slide.effects.stickerObjects ?? []).contains(where: { $0.id == id }) { return .sticker }
        return nil
    }

    @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
        guard mode == .edit else { return }
        switch recognizer.state {
        case .began:
            guard let id = hitTestItem(at: recognizer.location(in: self)) else { return }
            manipulatedItemId = id
            baseScale = currentScale(forId: id) ?? 1.0
        case .changed:
            guard let id = manipulatedItemId else { return }
            let newScale = max(0.3, min(4.0, baseScale * Double(recognizer.scale)))
            slide = updateScale(slideId: id, scale: newScale)
            onItemModified?(slide)
        case .ended, .cancelled, .failed:
            manipulatedItemId = nil
        default:
            break
        }
    }

    @objc private func handleRotation(_ recognizer: UIRotationGestureRecognizer) {
        guard mode == .edit else { return }
        switch recognizer.state {
        case .began:
            guard let id = hitTestItem(at: recognizer.location(in: self)) else { return }
            manipulatedItemId = id
            baseRotation = currentRotation(forId: id) ?? 0
        case .changed:
            guard let id = manipulatedItemId else { return }
            let degrees = Double(recognizer.rotation) * 180 / .pi
            slide = updateRotation(slideId: id, rotation: baseRotation + degrees)
            onItemModified?(slide)
        case .ended, .cancelled, .failed:
            manipulatedItemId = nil
        default:
            break
        }
    }

    @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
        guard mode == .edit else { return }
        let location = recognizer.location(in: self)
        switch recognizer.state {
        case .began:
            guard let id = hitTestItem(at: location),
                  let (sx, sy) = currentItemNormalizedPosition(forId: id) else { return }
            manipulatedItemId = id
            dragStartSlideX = sx
            dragStartSlideY = sy
        case .changed:
            guard let id = manipulatedItemId, bounds.size != .zero else { return }
            let translation = recognizer.translation(in: self)
            let dxNorm = Double(translation.x / bounds.width)
            let dyNorm = Double(translation.y / bounds.height)
            let rawX = clamp(dragStartSlideX + dxNorm)
            let rawY = clamp(dragStartSlideY + dyNorm)
            let (snappedX, didSnapX) = snap(rawX)
            let (snappedY, didSnapY) = snap(rawY)
            updateSnapGuides(x: didSnapX ? snappedX : nil,
                             y: didSnapY ? snappedY : nil)
            slide = updatePosition(slideId: id, x: snappedX, y: snappedY)
            onItemModified?(slide)
        case .ended, .cancelled, .failed:
            manipulatedItemId = nil
            hideSnapGuides()
        default:
            break
        }
    }

    // MARK: - Snap guides

    private static let snapTargets: [Double] = [0.18, 0.25, 0.5, 0.75, 0.82]
    private static let snapTolerance: Double = 0.02

    private var snapGuideLayers: [CAShapeLayer] = []

    private nonisolated func snap(_ value: Double) -> (snapped: Double, didSnap: Bool) {
        for target in Self.snapTargets where abs(value - target) < Self.snapTolerance {
            return (target, true)
        }
        return (value, false)
    }

    private func updateSnapGuides(x: Double?, y: Double?) {
        hideSnapGuides()
        guard bounds.size != .zero else { return }
        if let x {
            let line = makeGuideLine(verticalAt: CGFloat(x) * bounds.width,
                                     length: bounds.height,
                                     vertical: true)
            editOverlayLayer.addSublayer(line)
            snapGuideLayers.append(line)
        }
        if let y {
            let line = makeGuideLine(verticalAt: CGFloat(y) * bounds.height,
                                     length: bounds.width,
                                     vertical: false)
            editOverlayLayer.addSublayer(line)
            snapGuideLayers.append(line)
        }
    }

    private func hideSnapGuides() {
        snapGuideLayers.forEach { $0.removeFromSuperlayer() }
        snapGuideLayers.removeAll()
    }

    private func makeGuideLine(verticalAt offset: CGFloat,
                               length: CGFloat,
                               vertical: Bool) -> CAShapeLayer {
        let path = UIBezierPath()
        if vertical {
            path.move(to: CGPoint(x: offset, y: 0))
            path.addLine(to: CGPoint(x: offset, y: length))
        } else {
            path.move(to: CGPoint(x: 0, y: offset))
            path.addLine(to: CGPoint(x: length, y: offset))
        }
        let line = CAShapeLayer()
        line.path = path.cgPath
        line.strokeColor = UIColor.systemPink.cgColor
        line.lineWidth = 1
        line.lineDashPattern = [4, 4]
        line.fillColor = UIColor.clear.cgColor
        return line
    }

    // MARK: - Hit testing

    private func hitTestItem(at point: CGPoint) -> String? {
        guard let hit = itemsContainer.hitTest(point) else { return nil }
        var current: CALayer? = hit
        while let c = current {
            if let id = c.name,
               !id.isEmpty,
               c.superlayer === itemsContainer || c === itemsContainer {
                return id
            }
            current = c.superlayer
        }
        return nil
    }

    // MARK: - Slide mutation helpers

    private func currentItemNormalizedPosition(forId id: String) -> (Double, Double)? {
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) {
            return (t.x, t.y)
        }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            return (m.x, m.y)
        }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) {
            return (s.x, s.y)
        }
        return nil
    }

    private func currentScale(forId id: String) -> Double? {
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) { return t.scale }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) { return m.scale }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) { return s.scale }
        return nil
    }

    private func currentRotation(forId id: String) -> Double? {
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) { return t.rotation }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) { return m.rotation }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) { return s.rotation }
        return nil
    }

    private func updatePosition(slideId: String, x: Double, y: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:    { $0.x = x; $0.y = y },
                   media:   { $0.x = x; $0.y = y },
                   sticker: { $0.x = x; $0.y = y })
    }

    private func updateScale(slideId: String, scale: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:    { $0.scale = scale },
                   media:   { $0.scale = scale },
                   sticker: { $0.scale = scale })
    }

    private func updateRotation(slideId: String, rotation: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:    { $0.rotation = rotation },
                   media:   { $0.rotation = rotation },
                   sticker: { $0.rotation = rotation })
    }

    private func mutateItem(slideId: String,
                            text:    (inout StoryTextObject)  -> Void,
                            media:   (inout StoryMediaObject) -> Void,
                            sticker: (inout StorySticker)     -> Void) -> StorySlide {
        var newSlide = slide
        for i in newSlide.effects.textObjects.indices where newSlide.effects.textObjects[i].id == slideId {
            text(&newSlide.effects.textObjects[i])
            return newSlide
        }
        if var arr = newSlide.effects.mediaObjects {
            for i in arr.indices where arr[i].id == slideId {
                media(&arr[i])
                newSlide.effects.mediaObjects = arr
                return newSlide
            }
        }
        if var arr = newSlide.effects.stickerObjects {
            for i in arr.indices where arr[i].id == slideId {
                sticker(&arr[i])
                newSlide.effects.stickerObjects = arr
                return newSlide
            }
        }
        return newSlide
    }

    private nonisolated func clamp(_ value: Double) -> Double {
        max(0, min(1, value))
    }

    // MARK: - Item commands (used by context menu + accessibility)

    func deleteItem(id: String) {
        var newSlide = slide
        newSlide.effects.textObjects.removeAll { $0.id == id }
        newSlide.effects.mediaObjects?.removeAll { $0.id == id }
        newSlide.effects.stickerObjects?.removeAll { $0.id == id }
        slide = newSlide
        onItemModified?(slide)
    }

    func duplicateItem(id: String) {
        var newSlide = slide
        if let original = newSlide.effects.textObjects.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.effects.textObjects.append(copy)
            slide = newSlide
            onItemModified?(slide)
            return
        }
        if let original = newSlide.effects.mediaObjects?.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.effects.mediaObjects = (newSlide.effects.mediaObjects ?? []) + [copy]
            slide = newSlide
            onItemModified?(slide)
            return
        }
        if let original = newSlide.effects.stickerObjects?.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.effects.stickerObjects = (newSlide.effects.stickerObjects ?? []) + [copy]
            slide = newSlide
            onItemModified?(slide)
            return
        }
    }

    func sendToBack(id: String) {
        let newZ = nextBottomZ()
        slide = mutateItem(slideId: id,
                           text:    { $0.zIndex = newZ },
                           media:   { $0.zIndex = newZ },
                           sticker: { $0.zIndex = newZ })
        onItemModified?(slide)
    }

    private func nextTopZ() -> Int {
        let allZ = slide.effects.textObjects.map(\.zIndex)
            + (slide.effects.mediaObjects?.map(\.zIndex) ?? [])
            + (slide.effects.stickerObjects?.map(\.zIndex) ?? [])
        return (allZ.max() ?? 0) + 1
    }

    private func nextBottomZ() -> Int {
        let allZ = slide.effects.textObjects.map(\.zIndex)
            + (slide.effects.mediaObjects?.map(\.zIndex) ?? [])
            + (slide.effects.stickerObjects?.map(\.zIndex) ?? [])
        return (allZ.min() ?? 0) - 1
    }
}

// MARK: - UIContextMenuInteractionDelegate (long-press / right-click)

extension StoryCanvasUIView: UIContextMenuInteractionDelegate {
    public func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                       configurationForMenuAtLocation location: CGPoint)
    -> UIContextMenuConfiguration? {
        guard mode == .edit, let id = hitTestItem(at: location) else { return nil }
        return UIContextMenuConfiguration(
            identifier: id as NSString,
            previewProvider: nil
        ) { [weak self] _ in
            UIMenu(children: [
                UIAction(title: "Duplicate",
                         image: UIImage(systemName: "doc.on.doc")) { _ in
                    self?.duplicateItem(id: id)
                },
                UIAction(title: "Send to Back",
                         image: UIImage(systemName: "square.3.stack.3d.bottom.filled")) { _ in
                    self?.sendToBack(id: id)
                },
                UIAction(title: "Delete",
                         image: UIImage(systemName: "trash"),
                         attributes: .destructive) { _ in
                    self?.deleteItem(id: id)
                },
            ])
        }
    }
}

// MARK: - UIPointerInteractionDelegate (iPad / Mac Catalyst)

extension StoryCanvasUIView: UIPointerInteractionDelegate {
    public func pointerInteraction(_ interaction: UIPointerInteraction,
                                   regionFor request: UIPointerRegionRequest,
                                   defaultRegion: UIPointerRegion) -> UIPointerRegion? {
        guard mode == .edit, hitTestItem(at: request.location) != nil else { return nil }
        return defaultRegion
    }

    public func pointerInteraction(_ interaction: UIPointerInteraction,
                                   styleFor region: UIPointerRegion) -> UIPointerStyle? {
        guard mode == .edit, let view = interaction.view else { return nil }
        let preview = UITargetedPreview(view: view)
        return UIPointerStyle(effect: .lift(preview))
    }
}

// MARK: - UIGestureRecognizerDelegate

extension StoryCanvasUIView: UIGestureRecognizerDelegate {
    /// Pinch + rotation are allowed simultaneously (natural two-finger transform).
    /// Pan is exclusive — running it alongside pinch/rotation would corrupt the
    /// snapshot-based deltas (drag uses translation, others use scale/rotation).
    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                                   shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        let isPanA = gestureRecognizer === panRecognizer
        let isPanB = other === panRecognizer
        return !(isPanA || isPanB)
    }
}
