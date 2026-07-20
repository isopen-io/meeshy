import SwiftUI
import MeeshySDK

public struct TransitionBadge: View, Equatable {

    // MARK: - SOTA P7: Equatable (excludes closures — visual props only)
    public static func == (lhs: TransitionBadge, rhs: TransitionBadge) -> Bool {
        lhs.id == rhs.id
            && lhs.kind == rhs.kind
            && lhs.duration == rhs.duration
            && lhs.isSelected == rhs.isSelected
            && lhs.isDark == rhs.isDark
            && lhs.anchorX == rhs.anchorX
            && lhs.laneHeight == rhs.laneHeight
    }

    public let id: String
    public let kind: StoryTransitionKind
    public let duration: Float
    public let isSelected: Bool
    public let isDark: Bool
    public let anchorX: CGFloat
    public let laneHeight: CGFloat
    public let onTap: () -> Void
    public let onLongPress: () -> Void
    public let onDurationDelta: (CGFloat) -> Void

    public init(
        id: String, kind: StoryTransitionKind, duration: Float,
        isSelected: Bool, isDark: Bool, anchorX: CGFloat, laneHeight: CGFloat,
        onTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void,
        onDurationDelta: @escaping (CGFloat) -> Void
    ) {
        self.id = id; self.kind = kind; self.duration = duration
        self.isSelected = isSelected; self.isDark = isDark
        self.anchorX = anchorX; self.laneHeight = laneHeight
        self.onTap = onTap; self.onLongPress = onLongPress
        self.onDurationDelta = onDurationDelta
    }

    public var accessibilityComposed: String {
        // Both kinds render identically (dissolve degrades to a crossfade
        // opacity ramp — see ReaderTransitionResolver.liveRenderableTransition),
        // so both are labeled as crossfade. Prevents VoiceOver announcing a
        // "Dissolve" capability the app doesn't actually render.
        let kindLabel = String(localized: "story.timeline.transition.kind.crossfade", bundle: .module)
        return "\(kindLabel) — \(String(format: "%.2f", duration))s"
    }

    public var body: some View {
        ZStack {
            Diamond()
                .fill(MeeshyColors.warning)
                .overlay(Diamond().stroke(Color.black.opacity(0.6), lineWidth: 1))
                .shadow(color: MeeshyColors.warning.opacity(0.65), radius: isSelected ? 8 : 3)
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(.black)
                .accessibilityHidden(true)
        }
        .frame(width: 18, height: 18)
        .position(x: anchorX, y: laneHeight / 2)
        .contentShape(Rectangle().inset(by: -16))
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
        .gesture(
            DragGesture(minimumDistance: 2)
                .onChanged { v in onDurationDelta(v.translation.width) }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityComposed)
        .accessibilityHint(String(localized: "story.timeline.transition.delete", bundle: .module))
    }
}

private struct Diamond: Shape {
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
