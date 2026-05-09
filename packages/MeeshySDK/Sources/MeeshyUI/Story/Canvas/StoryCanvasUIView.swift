import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import PencilKit
import MeeshySDK

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

    /// Called whenever a gesture mutates the slide (Tasks 2.7+).
    public var onItemModified: ((StorySlide) -> Void)?

    // MARK: - Internal layers

    private let rootLayer = CALayer()
    private let itemsContainer = CALayer()
    private let editOverlayLayer = CALayer()

    // MARK: - Gestures

    private var panRecognizer: UIPanGestureRecognizer!
    private var pinchRecognizer: UIPinchGestureRecognizer!
    private var rotationRecognizer: UIRotationGestureRecognizer!

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
        rootLayer.addSublayer(itemsContainer)
        rootLayer.addSublayer(editOverlayLayer)
        editOverlayLayer.zPosition = 10_000  // always on top
        backgroundColor = .black
        setupGesturesAll()
        observeAppLifecycle()
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
        guard mode == .edit else { return nil }
        var elements: [UIAccessibilityElement] = []
        for txt in slide.effects.textObjects {
            elements.append(makeAccessibilityElement(
                label: "Texte : \(txt.text)",
                traits: .staticText,
                id: txt.id
            ))
        }
        for media in slide.effects.mediaObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo" : "Image",
                traits: .image,
                id: media.id
            ))
        }
        for sticker in slide.effects.stickerObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: "Sticker \(sticker.emoji)",
                traits: .image,
                id: sticker.id
            ))
        }
        return elements
    }

    private func makeAccessibilityElement(label: String,
                                          traits: UIAccessibilityTraits,
                                          id: String) -> UIAccessibilityElement {
        let el = UIAccessibilityElement(accessibilityContainer: self)
        el.accessibilityLabel = label
        el.accessibilityTraits = traits
        el.accessibilityFrameInContainerSpace = layerFrame(forId: id)
        el.accessibilityCustomActions = makeCustomActions(forId: id)
        return el
    }

    private func layerFrame(forId id: String) -> CGRect {
        (itemsContainer.sublayers?.first(where: { $0.name == id })?.frame) ?? .zero
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

    public func setMode(_ newMode: RenderMode, time: CMTime = .zero) {
        let didChange = mode != newMode
        mode = newMode
        currentTime = time
        rebuildLayers()
        if didChange {
            switch newMode {
            case .play:
                stopEditDisplayLink()
                startPlayback()
            case .edit:
                stopPlayback()
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

        itemsContainer.sublayers?.forEach { $0.removeFromSuperlayer() }
        let rendered = StoryRenderer.render(slide: slide,
                                            into: geometry,
                                            at: currentTime,
                                            mode: mode)
        for sub in rendered.sublayers ?? [] {
            itemsContainer.addSublayer(sub)
        }
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

    @objc private func handleWillResignActive() {
        forEachAVPlayer { $0.pause() }
    }

    @objc private func handleDidBecomeActive() {
        guard mode == .play else { return }
        forEachAVPlayer { $0.play() }
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
        for recognizer: UIGestureRecognizer in [panRecognizer, pinchRecognizer, rotationRecognizer] {
            recognizer.delegate = self
            addGestureRecognizer(recognizer)
        }
        addInteraction(UIPointerInteraction(delegate: self))
        addInteraction(UIContextMenuInteraction(delegate: self))
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
