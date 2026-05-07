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

    public init(
        currentTime: Float, totalDuration: Float,
        geometry: TimelineGeometry, laneHeight: CGFloat,
        isDark: Bool, onScrub: @escaping (Float) -> Void
    ) {
        self.currentTime = currentTime; self.totalDuration = totalDuration
        self.geometry = geometry; self.laneHeight = laneHeight
        self.isDark = isDark; self.onScrub = onScrub
    }

    public var computedX: CGFloat { geometry.x(for: currentTime) }

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
                    let raw = geometry.time(forX: max(0, computedX + v.translation.width))
                    let clamped = max(0, min(raw, totalDuration))
                    onScrub(clamped)
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
