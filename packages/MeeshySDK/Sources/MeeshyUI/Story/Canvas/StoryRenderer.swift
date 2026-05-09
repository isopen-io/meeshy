import Foundation
import QuartzCore
import CoreMedia
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
    /// - Returns: A root `CALayer` whose sublayers represent the slide's items.
    @MainActor
    public static func render(slide: StorySlide,
                              into geometry: CanvasGeometry,
                              at time: CMTime,
                              mode: RenderMode) -> CALayer {
        let root = CALayer()
        root.frame = CGRect(origin: .zero, size: geometry.renderSize)
        root.anchorPoint = CGPoint(x: 0, y: 0)
        root.contentsScale = UIScreen.main.scale

        let allItems = collectItems(from: slide)
        for item in allItems.sorted(by: { $0.zIndex < $1.zIndex }) {
            guard shouldRender(item: item, at: time, mode: mode) else { continue }
            let layer = renderItem(item, into: geometry, at: time, mode: mode)
            root.addSublayer(layer)
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

    private static func shouldRender(item: any RenderableItem, at time: CMTime, mode: RenderMode) -> Bool {
        guard mode == .play else { return true }
        let t = CMTimeGetSeconds(time)
        let start = item.startTime ?? 0
        let end = (item.duration.map { start + $0 }) ?? .infinity
        return t >= start && t < end
    }

    @MainActor
    private static func renderItem(_ item: any RenderableItem,
                                   into geometry: CanvasGeometry,
                                   at time: CMTime,
                                   mode: RenderMode) -> CALayer {
        // Per-type specialization wired in Tasks 2.2 (media), 2.3 (text), 2.4 (sticker).
        let layer = CALayer()
        layer.zPosition = CGFloat(item.zIndex)
        layer.name = item.id
        return layer
    }
}
