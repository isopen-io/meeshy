import SwiftUI

public struct PlayheadView: View, Equatable {

    // MARK: - SOTA P7: Equatable (excludes closures — visual props only)
    public static func == (lhs: PlayheadView, rhs: PlayheadView) -> Bool {
        lhs.currentTime == rhs.currentTime
            && lhs.totalDuration == rhs.totalDuration
            && lhs.geometry == rhs.geometry
            && lhs.laneHeight == rhs.laneHeight
            && lhs.isDark == rhs.isDark
    }

    public let currentTime: Float
    public let totalDuration: Float
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let isDark: Bool
    public let onScrub: (Float) -> Void
    /// Called once when the drag starts. Hosts wire this to
    /// `TimelineViewModel.beginScrub()` so continuous `onScrub` callbacks
    /// forward `precise: false` to the engine (sub-50ms tolerance) and avoid
    /// the AVPlayer GOP-decompression freeze.
    public let onScrubBegan: () -> Void
    /// Called once when the drag ends. Hosts wire this to
    /// `TimelineViewModel.endScrub()` so the final seek is frame-accurate.
    public let onScrubEnded: () -> Void

    public init(
        currentTime: Float, totalDuration: Float,
        geometry: TimelineGeometry, laneHeight: CGFloat,
        isDark: Bool, onScrub: @escaping (Float) -> Void,
        onScrubBegan: @escaping () -> Void = {},
        onScrubEnded: @escaping () -> Void = {}
    ) {
        self.currentTime = currentTime; self.totalDuration = totalDuration
        self.geometry = geometry; self.laneHeight = laneHeight
        self.isDark = isDark; self.onScrub = onScrub
        self.onScrubBegan = onScrubBegan; self.onScrubEnded = onScrubEnded
    }

    public var computedX: CGFloat { geometry.x(for: currentTime) }

    /// Tracks whether the gesture's first `.onChanged` has fired in the
    /// current drag — DragGesture has no `.onBegan`, so we synthesize it.
    @State private var dragInFlight: Bool = false

    /// P2 fix — anchor X captured once at drag start. During the drag we
    /// derive the playhead position from `dragStartX + translation.width`
    /// instead of `computedX + translation.width`. This prevents jitter when
    /// `currentTime` is updated asynchronously by the engine (`onTimeUpdate`)
    /// while a scrub is in flight: a fresh `currentTime` would otherwise
    /// shift `computedX` and double-apply the translation.
    ///
    /// Mirrors `ClipSelectionState.ActiveDrag.originalStartTime` (P0-#5).
    @State private var dragStartX: CGFloat = 0

    public var body: some View {
        ZStack(alignment: .top) {
            Triangle()
                .fill(Color.white)
                .frame(width: 12, height: 8)
                .offset(y: -2)
            Rectangle()
                .fill(Color.white)
                .frame(width: 1.5, height: laneHeight)
                .shadow(color: Color.black.opacity(0.4), radius: 2)
        }
        .frame(width: 24, height: laneHeight, alignment: .top)
        .contentShape(Rectangle().inset(by: -16))
        .position(x: computedX, y: laneHeight / 2)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { v in
                    if !dragInFlight {
                        dragInFlight = true
                        dragStartX = computedX
                        onScrubBegan()
                    }
                    let clamped = Self.scrubTime(
                        dragStartX: dragStartX,
                        translationX: v.translation.width,
                        geometry: geometry,
                        totalDuration: totalDuration
                    )
                    onScrub(clamped)
                }
                .onEnded { _ in
                    if dragInFlight {
                        dragInFlight = false
                        dragStartX = 0
                        onScrubEnded()
                    }
                }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "story.timeline.a11y.playhead", bundle: .module))
        .accessibilityValue(
            String(format: "%.2fs / %.2fs", currentTime, totalDuration)
        )
        .accessibilityAdjustableAction { direction in
            let frame: Float = 1.0 / 60.0
            switch direction {
            case .increment: onScrub(min(totalDuration, currentTime + frame))
            case .decrement: onScrub(max(0, currentTime - frame))
            @unknown default: break
            }
        }
    }

    /// Pure projection of a drag translation into a clamped scrub time.
    /// Exposed as a `nonisolated` static so unit tests can validate the math
    /// without driving a SwiftUI `DragGesture`.
    nonisolated public static func scrubTime(
        dragStartX: CGFloat,
        translationX: CGFloat,
        geometry: TimelineGeometry,
        totalDuration: Float
    ) -> Float {
        let raw = geometry.time(forX: max(0, dragStartX + translationX))
        return max(0, min(raw, totalDuration))
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.closeSubpath()
        return p
    }
}
