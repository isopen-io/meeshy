import SwiftUI

public struct SwipeAction: Identifiable {
    public let id = UUID()
    public let icon: String
    public let label: String
    public let color: Color
    public let action: () -> Void

    public init(icon: String, label: String, color: Color, action: @escaping () -> Void) {
        self.icon = icon; self.label = label; self.color = color; self.action = action
    }
}

public struct SwipeableRow<Content: View>: View {
    public let content: Content
    public let leadingActions: [SwipeAction]
    public let trailingActions: [SwipeAction]

    @State private var offset: CGFloat = 0
    @State private var activeSwipeSide: SwipeSide = .none
    @GestureState private var dragOffset: CGFloat = 0

    private let actionWidth: CGFloat = 72
    private let snapThreshold: CGFloat = 50
    private let fullSwipeThreshold: CGFloat = 160

    private enum SwipeSide { case none, leading, trailing }

    public init(leadingActions: [SwipeAction] = [], trailingActions: [SwipeAction] = [], @ViewBuilder content: () -> Content) {
        self.leadingActions = leadingActions; self.trailingActions = trailingActions; self.content = content()
    }

    private var totalLeadingWidth: CGFloat { CGFloat(leadingActions.count) * actionWidth }
    private var totalTrailingWidth: CGFloat { CGFloat(trailingActions.count) * actionWidth }

    public var body: some View {
        ZStack {
            if !leadingActions.isEmpty {
                HStack(spacing: 0) { ForEach(leadingActions) { action in actionButton(action) }; Spacer() }
                    .opacity(currentOffset > 0 ? 1 : 0)
            }
            if !trailingActions.isEmpty {
                HStack(spacing: 0) { Spacer(); ForEach(trailingActions) { action in actionButton(action) } }
                    .opacity(currentOffset < 0 ? 1 : 0)
            }
            content
                .offset(x: currentOffset)
                .gesture(
                    DragGesture(minimumDistance: 20)
                        .updating($dragOffset) { value, state, _ in
                            let horizontal = value.translation.width
                            let vertical = abs(value.translation.height)
                            guard abs(horizontal) > vertical else { return }
                            state = horizontal
                        }
                        .onEnded { value in handleDragEnd(value) }
                )
                .animation(.spring(response: 0.35, dampingFraction: 0.8), value: offset)
        }
        .clipped()
    }

    private var currentOffset: CGFloat {
        let raw = offset + dragOffset
        if raw > 0 && leadingActions.isEmpty { return 0 }
        if raw < 0 && trailingActions.isEmpty { return 0 }
        let maxLeading = totalLeadingWidth; let maxTrailing = totalTrailingWidth
        if raw > maxLeading { return maxLeading + (raw - maxLeading) * 0.3 }
        if raw < -maxTrailing { return -(maxTrailing + (abs(raw) - maxTrailing) * 0.3) }
        return raw
    }

    private func handleDragEnd(_ value: DragGesture.Value) {
        let horizontal = value.translation.width
        let velocity = value.predictedEndTranslation.width - value.translation.width
        if horizontal > fullSwipeThreshold && !leadingActions.isEmpty {
            leadingActions[0].action(); HapticFeedback.medium()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { offset = 0; activeSwipeSide = .none }; return
        }
        if horizontal < -fullSwipeThreshold && !trailingActions.isEmpty {
            trailingActions[0].action(); HapticFeedback.medium()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { offset = 0; activeSwipeSide = .none }; return
        }
        if horizontal > snapThreshold && !leadingActions.isEmpty && velocity >= 0 {
            offset = totalLeadingWidth; activeSwipeSide = .leading; HapticFeedback.light()
        } else if horizontal < -snapThreshold && !trailingActions.isEmpty && velocity <= 0 {
            offset = -totalTrailingWidth; activeSwipeSide = .trailing; HapticFeedback.light()
        } else { offset = 0; activeSwipeSide = .none }
    }

    private func actionButton(_ action: SwipeAction) -> some View {
        Button {
            action.action(); HapticFeedback.medium()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { offset = 0; activeSwipeSide = .none }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: action.icon).font(.system(size: 18, weight: .semibold))
                Text(action.label).font(.system(size: 10, weight: .medium))
            }
            .foregroundColor(.white)
            .frame(width: actionWidth, height: 72)
            .background(action.color)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .padding(.horizontal, 2)
    }

    public func resetSwipe() { /* NOTE: This would need a binding pattern to work from outside */ }
}
