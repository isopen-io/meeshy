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
