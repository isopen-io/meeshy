import UIKit
import QuartzCore
import CoreMedia
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

    // MARK: - Display link

    private var displayLink: CADisplayLink?

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
    }

    @available(*, unavailable)
    public required init?(coder: NSCoder) {
        fatalError("StoryCanvasUIView does not support NSCoder")
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

    public func setMode(_ newMode: RenderMode, time: CMTime = .zero) {
        let didChange = mode != newMode
        mode = newMode
        currentTime = time
        rebuildLayers()
        if didChange {
            switch newMode {
            case .play: startPlayback()
            case .edit: stopPlayback()
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
}
