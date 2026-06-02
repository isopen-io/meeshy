import Foundation

/// Pure, `nonisolated` layout model for the composer bottom band — single source of truth
/// for each band tool's sheet height + collapse (peek). Replaces drawing-only `@State`.
/// `.timeline` is excluded (it is a full-screen sheet, never in the band).
///
/// Heights are typed as `Double` (= `CGFloat` on all Apple 64-bit targets) so the
/// pure model can live in a `nonisolated` context without importing CoreGraphics or
/// CoreFoundation — which would introduce `@MainActor`-isolated initialiser overloads
/// that conflict with the Swift 6 `defaultIsolation(MainActor)` build setting of MeeshyUI.
/// Call sites in views simply pass/receive `CGFloat` values — the types are identical.
public nonisolated struct BandLayoutState: Equatable, Sendable {

    public static let minHeight: Double = 160
    public static let maxHeight: Double = 540
    public static let cardedMaxFraction: Double = 0.42

    private var heights: [StoryToolMode: Double] = [:]
    private var collapsed: Set<StoryToolMode> = []

    public init() {}

    public static func isBandEligible(_ tool: StoryToolMode) -> Bool { tool != .timeline }

    public static func clamp(_ height: Double, cappedMax: Double) -> Double {
        let ceiling = Swift.max(minHeight, cappedMax)
        return Swift.min(ceiling, Swift.max(minHeight, height))
    }

    public static func cappedMax(screenHeight: Double, canvasCarded: Bool) -> Double {
        guard canvasCarded else { return maxHeight }
        return Swift.min(maxHeight, screenHeight * cardedMaxFraction)
    }

    private static func defaultHeight(for tool: StoryToolMode) -> Double {
        switch tool {
        case .media:    return 220
        case .audio:    return 220
        case .drawing:  return 280
        case .text:     return 280
        case .texture:  return 160
        case .filters:  return 180
        case .timeline: return 0
        }
    }

    public func height(for tool: StoryToolMode) -> Double { heights[tool] ?? Self.defaultHeight(for: tool) }
    public func isCollapsed(_ tool: StoryToolMode) -> Bool { Self.isBandEligible(tool) && collapsed.contains(tool) }
    public func canvasIsFull(for tool: StoryToolMode) -> Bool { isCollapsed(tool) }

    public func applyingResize(for tool: StoryToolMode, to height: Double, cappedMax: Double) -> BandLayoutState {
        guard Self.isBandEligible(tool) else { return self }
        var copy = self; copy.heights[tool] = Self.clamp(height, cappedMax: cappedMax); return copy
    }
    public func collapsing(_ tool: StoryToolMode) -> BandLayoutState {
        guard Self.isBandEligible(tool) else { return self }
        var copy = self; copy.collapsed.insert(tool); return copy
    }
    public func expanding(_ tool: StoryToolMode) -> BandLayoutState {
        var copy = self; copy.collapsed.remove(tool); return copy
    }
}
