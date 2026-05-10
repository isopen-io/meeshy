import Foundation
import QuartzCore
import CoreMedia
import PencilKit
import UIKit
import MeeshySDK

// MARK: - RenderMode

public enum RenderMode: Sendable {
    /// All items always visible. Gestures active. ProMotion 120 Hz.
    case edit
    /// Items respect timing windows (startTime, duration, fadeIn/fadeOut). 60 Hz.
    case play
}

// MARK: - RenderableItem

/// Common contract for any item drawn into the Story canvas.
///
/// Anchor lives in normalized [0,1] space and is a `CGPoint` (not SwiftUI `UnitPoint`)
/// because the storage type lives in the MeeshySDK target which forbids SwiftUI imports
/// (dual-target rule, see packages/MeeshySDK/CLAUDE.md).
public protocol RenderableItem {
    var id: String { get }
    var x: Double { get }
    var y: Double { get }
    var scale: Double { get }
    var rotation: Double { get }
    var zIndex: Int { get }
    var anchor: CGPoint { get }
    var startTime: Double? { get }
    var duration: Double? { get }
    var fadeIn: Double? { get }
    var fadeOut: Double? { get }
}

extension StoryTextObject: RenderableItem {}
extension StoryMediaObject: RenderableItem {}
extension StorySticker: RenderableItem {}

extension RenderableItem {
    /// A static item has no timing windows, no fades, no keyframes — its rendered
    /// representation never changes during a slide, so it's a good rasterization
    /// candidate during `.play`.
    public var isStatic: Bool {
        startTime == nil && duration == nil && fadeIn == nil && fadeOut == nil
    }
}

// MARK: - StoryRenderer

/// Single source of rendering for the Story canvas. Called by:
/// - `StoryCanvasUIView` (live render in composer/viewer)
/// - `StoryAVCompositor` (per-frame export — Phase 4)
/// - Snapshot tests (Phase 0/2)
public enum StoryRenderer {

    /// Renders a slide into a fresh CALayer tree fitting the given canvas geometry, at the given time.
    ///
    /// - Parameters:
    ///   - slide: The slide whose effects will be drawn.
    ///   - geometry: The target canvas dimensions (drives design→render scaling).
    ///   - time: The current playback time (used in `.play` mode for timing windows).
    ///   - mode: `.edit` shows everything, `.play` respects startTime/duration.
    ///   - languages: Preferred languages for Prisme Linguistique text resolution (`.play` only).
    ///     In `.edit` mode, the raw source text is always displayed regardless of this parameter.
    ///     Defaults to `[]` for backward compat with existing call sites.
    /// - Returns: A root `CALayer` whose sublayers represent the slide's items.
    @MainActor
    public static func render(slide: StorySlide,
                              into geometry: CanvasGeometry,
                              at time: CMTime,
                              mode: RenderMode,
                              languages: [String] = []) -> CALayer {
        let root = CALayer()
        root.frame = CGRect(origin: .zero, size: geometry.renderSize)
        root.anchorPoint = CGPoint(x: 0, y: 0)
        root.contentsScale = UIScreen.main.scale

        let allItems = collectItems(from: slide)
        for item in allItems.sorted(by: { $0.zIndex < $1.zIndex }) {
            guard shouldRender(item: item, at: time, mode: mode) else { continue }
            let layer = renderItem(item, into: geometry, at: time, mode: mode, languages: languages)
            root.addSublayer(layer)
        }

        // Phase 3 Task 3.4 — render persisted PKDrawing as a single overlay
        // layer above the items (zPosition 9999). The drawing is authored on
        // the design canvas (1080×1920) and projected to the render size by
        // PKDrawing.image(from:scale:).
        if let drawingData = slide.effects.drawingData,
           let drawing = try? PKDrawing(data: drawingData) {
            let drawingLayer = CALayer()
            drawingLayer.frame = CGRect(origin: .zero, size: geometry.renderSize)
            let img = drawing.image(
                from: CGRect(origin: .zero, size: CanvasGeometry.designSize),
                scale: UIScreen.main.scale
            )
            drawingLayer.contents = img.cgImage
            drawingLayer.contentsScale = UIScreen.main.scale
            drawingLayer.zPosition = 9999
            root.addSublayer(drawingLayer)
        }

        return root
    }

    // MARK: - Private

    private static func collectItems(from slide: StorySlide) -> [any RenderableItem] {
        var items: [any RenderableItem] = []
        items.append(contentsOf: slide.effects.textObjects)
        items.append(contentsOf: slide.effects.mediaObjects ?? [])
        items.append(contentsOf: slide.effects.stickerObjects ?? [])
        return items
    }

    @MainActor
    private static func shouldRender(item: any RenderableItem, at time: CMTime, mode: RenderMode) -> Bool {
        guard mode == .play else { return true }
        let t = CMTimeGetSeconds(time)
        let start = item.startTime ?? 0
        let end = (item.duration.map { start + $0 }) ?? .infinity
        // Reduce Motion: sharp visibility cut, no fadeIn/fadeOut interpolation
        // (fade interpolation lands in Phase 3 with CAAnimation; this branch is
        // structurally future-proof so no diff is needed when fades arrive).
        if UIAccessibility.isReduceMotionEnabled {
            return t >= start && t < end
        }
        return t >= start && t < end
    }

    @MainActor
    private static func renderItem(_ item: any RenderableItem,
                                   into geometry: CanvasGeometry,
                                   at time: CMTime,
                                   mode: RenderMode,
                                   languages: [String] = []) -> CALayer {
        if let media = item as? StoryMediaObject {
            let layer = StoryMediaLayer()
            layer.configure(with: media, geometry: geometry, mode: mode)
            return layer
        }
        if let text = item as? StoryTextObject {
            let layer = StoryTextLayer()
            // Prisme Linguistique: in .play mode resolve the preferred-language
            // translation; in .edit mode always show the raw source text so the
            // author edits the original, not a translated copy.
            let displayText = (mode == .play)
                ? text.resolvedText(preferredLanguages: languages)
                : text.text
            var displayObj = text
            displayObj.text = displayText
            layer.configure(with: displayObj, geometry: geometry, mode: mode)
            return layer
        }
        if let sticker = item as? StorySticker {
            let layer = StoryStickerLayer()
            layer.configure(with: sticker, geometry: geometry, mode: mode)
            return layer
        }
        // Unknown RenderableItem type — bare placeholder.
        let layer = CALayer()
        layer.zPosition = CGFloat(item.zIndex)
        layer.name = item.id
        return layer
    }
}

// MARK: - renderBackground

extension StoryRenderer {

    /// Resolves the background `Kind` for a slide, reading SDK model fields.
    ///
    /// Priority order:
    /// 1. Background video media object (`isBackground == true`, kind == .video`)
    /// 2. Background image media object (`isBackground == true`, kind == .image`)
    /// 3. `effects.background` hex color string
    /// 4. Fallback: `.solidColor(.black)`
    public static func renderBackground(slide: StorySlide,
                                        languages: [String]) -> StoryBackgroundLayer.Kind {
        // Video background object
        if let bgVideo = slide.effects.mediaObjects?.first(where: { $0.isBackground && $0.kind == .video }) {
            return .video(postMediaId: bgVideo.postMediaId,
                          looping: bgVideo.loop ?? true,
                          mute: true)
        }
        // Image background object or slide.mediaURL
        if let bgImage = slide.effects.mediaObjects?.first(where: { $0.isBackground && $0.kind == .image }) {
            return .image(postMediaId: bgImage.postMediaId,
                          thumbHash: slide.effects.thumbHash)
        }
        if let urlString = slide.mediaURL, !urlString.isEmpty {
            return .image(postMediaId: slide.id, thumbHash: slide.effects.thumbHash)
        }
        // Hex color from effects.background
        if let hex = slide.effects.background, let color = uiColor(fromHex: hex) {
            return .solidColor(color)
        }
        return .solidColor(.black)
    }

    // MARK: Private helpers

    private static func uiColor(fromHex hex: String) -> UIColor? {
        var s = hex
        if s.hasPrefix("#") { s.removeFirst() }
        guard let v = UInt32(s, radix: 16), s.count == 6 else { return nil }
        let r = CGFloat((v >> 16) & 0xff) / 255
        let g = CGFloat((v >> 8) & 0xff) / 255
        let b = CGFloat(v & 0xff) / 255
        return UIColor(red: r, green: g, blue: b, alpha: 1)
    }
}

// MARK: - clipTransitionOpacity

extension StoryRenderer {

    /// Returns the effective opacity `[0, 1]` for `media` at playback time `at`,
    /// given a list of `StoryClipTransition` entries and the global time at which
    /// the transition window starts (`transitionStart`).
    ///
    /// Only `kind == .crossfade` is handled; other kinds are treated as opaque.
    /// Outside the transition window the function returns `1.0`.
    ///
    /// `nonisolated` — pure arithmetic, no UIKit.
    public nonisolated static func clipTransitionOpacity(for media: StoryMediaObject,
                                                         transitions: [StoryClipTransition],
                                                         transitionStart: Double,
                                                         at time: Double) -> Double {
        for tr in transitions where tr.kind == .crossfade {
            let duration = Double(tr.duration)
            let inWindow = time >= transitionStart && time <= (transitionStart + duration)
            guard inWindow else { continue }
            let progress = (time - transitionStart) / duration
            if media.id == tr.fromClipId { return 1.0 - progress }
            if media.id == tr.toClipId   { return progress }
        }
        return 1.0
    }
}

// MARK: - applyKeyframes

extension StoryRenderer {

    /// Interpolated overrides produced by `applyKeyframes`.
    public struct KeyframeOverrides: Sendable {
        public nonisolated let position: CGPoint?
        public nonisolated let scale: Double?
        public nonisolated let opacity: Double?

        public nonisolated init(position: CGPoint?, scale: Double?, opacity: Double?) {
            self.position = position
            self.scale = scale
            self.opacity = opacity
        }
    }

    /// Returns interpolated overrides at `currentTime` (global seconds) for an
    /// item whose animation clock starts at `startTime`.
    ///
    /// Pure computation — no UIKit access. `nonisolated` so tests can call it
    /// without hopping to `@MainActor`. Delegates per-channel arithmetic to
    /// `KeyframeInterpolator`. Returns `nil` overrides when `keyframes` is empty.
    public nonisolated static func applyKeyframes(keyframes: [StoryKeyframe],
                                                  at currentTime: Double,
                                                  startTime: Double = 0) -> KeyframeOverrides {
        guard !keyframes.isEmpty else {
            return KeyframeOverrides(position: nil, scale: nil, opacity: nil)  // nonisolated init
        }
        let local = Float(max(0, currentTime - startTime))

        let xTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.x.map { (kf.time, $0, kf.easing ?? .linear) }
        }
        let yTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.y.map { (kf.time, $0, kf.easing ?? .linear) }
        }
        let scaleTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.scale.map { (kf.time, $0, kf.easing ?? .linear) }
        }
        let opacityTuples: [(time: Float, value: CGFloat, easing: StoryEasing)] = keyframes.compactMap { kf in
            kf.opacity.map { (kf.time, $0, kf.easing ?? .linear) }
        }

        let xVal = KeyframeInterpolator.interpolate(keyframes: xTuples, at: local)
        let yVal = KeyframeInterpolator.interpolate(keyframes: yTuples, at: local)
        let sVal = KeyframeInterpolator.interpolate(keyframes: scaleTuples, at: local)
        let oVal = KeyframeInterpolator.interpolate(keyframes: opacityTuples, at: local)

        let pos: CGPoint? = (xVal != nil && yVal != nil) ? CGPoint(x: xVal!, y: yVal!) : nil
        return KeyframeOverrides(
            position: pos,
            scale: sVal.map { Double($0) },
            opacity: oVal.map { Double($0) }
        )
    }
}
