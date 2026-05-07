import SwiftUI

public struct KeyframeMarkerView: View {

    public let keyframeId: String
    public let absoluteTime: Float
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let isSelected: Bool
    public let onTap: () -> Void
    public let onLongPress: () -> Void
    public let onDragDelta: (CGFloat) -> Void

    public init(keyframeId: String, absoluteTime: Float,
                geometry: TimelineGeometry, laneHeight: CGFloat,
                isSelected: Bool,
                onTap: @escaping () -> Void,
                onLongPress: @escaping () -> Void,
                onDragDelta: @escaping (CGFloat) -> Void) {
        self.keyframeId = keyframeId; self.absoluteTime = absoluteTime
        self.geometry = geometry; self.laneHeight = laneHeight
        self.isSelected = isSelected
        self.onTap = onTap; self.onLongPress = onLongPress
        self.onDragDelta = onDragDelta
    }

    public var accessibilityComposed: String {
        String(format: String(localized: "story.timeline.a11y.keyframe", bundle: .module),
               String(format: "%.2fs", absoluteTime))
    }

    public var body: some View {
        let x = geometry.x(for: absoluteTime)
        SmallDiamond()
            .fill(MeeshyColors.warning)
            .overlay(SmallDiamond().stroke(Color.black.opacity(0.55), lineWidth: 0.8))
            .frame(width: isSelected ? 10 : 8, height: isSelected ? 10 : 8)
            .position(x: x, y: laneHeight / 2)
            .contentShape(Rectangle().inset(by: -16))
            .onTapGesture { onTap() }
            .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
            .gesture(
                DragGesture(minimumDistance: 1)
                    .onChanged { v in onDragDelta(v.translation.width) }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityComposed)
    }
}

private struct SmallDiamond: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        p.closeSubpath()
        return p
    }
}
