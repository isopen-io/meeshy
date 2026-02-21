import SwiftUI

// MARK: - Swipe Action Model

struct SwipeAction: Identifiable {
    let id = UUID()
    let icon: String
    let label: String
    let color: Color
    let action: () -> Void
}

// MARK: - Swipeable Row

struct SwipeableRow<Content: View>: View {
    let content: Content
    let leadingActions: [SwipeAction]
    let trailingActions: [SwipeAction]

    @State private var offset: CGFloat = 0
    @State private var activeSwipeSide: SwipeSide = .none
    @GestureState private var dragOffset: CGFloat = 0

    private let actionWidth: CGFloat = 72
    private let snapThreshold: CGFloat = 50
    private let fullSwipeThreshold: CGFloat = 160

    private enum SwipeSide {
        case none, leading, trailing
    }

    init(
        leadingActions: [SwipeAction] = [],
        trailingActions: [SwipeAction] = [],
        @ViewBuilder content: () -> Content
    ) {
        self.leadingActions = leadingActions
        self.trailingActions = trailingActions
        self.content = content()
    }

    private var totalLeadingWidth: CGFloat {
        CGFloat(leadingActions.count) * actionWidth
    }

    private var totalTrailingWidth: CGFloat {
        CGFloat(trailingActions.count) * actionWidth
    }

    var body: some View {
        ZStack {
            // Leading actions (revealed when swiping right)
            if !leadingActions.isEmpty {
                HStack(spacing: 0) {
                    ForEach(leadingActions) { action in
                        actionButton(action)
                    }
                    Spacer()
                }
                .opacity(currentOffset > 0 ? 1 : 0)
            }

            // Trailing actions (revealed when swiping left)
            if !trailingActions.isEmpty {
                HStack(spacing: 0) {
                    Spacer()
                    ForEach(trailingActions) { action in
                        actionButton(action)
                    }
                }
                .opacity(currentOffset < 0 ? 1 : 0)
            }

            // Main content
            content
                .offset(x: currentOffset)
                .gesture(
                    DragGesture(minimumDistance: 20)
                        .updating($dragOffset) { value, state, _ in
                            let horizontal = value.translation.width
                            let vertical = abs(value.translation.height)
                            // Only allow horizontal swipe (not vertical scroll)
                            guard abs(horizontal) > vertical else { return }
                            state = horizontal
                        }
                        .onEnded { value in
                            handleDragEnd(value)
                        }
                )
                .animation(.spring(response: 0.35, dampingFraction: 0.8), value: offset)
        }
        .clipped()
    }

    private var currentOffset: CGFloat {
        let raw = offset + dragOffset

        // Limit leading offset
        if raw > 0 && leadingActions.isEmpty { return 0 }
        if raw < 0 && trailingActions.isEmpty { return 0 }

        // Rubber band effect past max
        let maxLeading = totalLeadingWidth
        let maxTrailing = totalTrailingWidth

        if raw > maxLeading {
            let excess = raw - maxLeading
            return maxLeading + excess * 0.3
        }
        if raw < -maxTrailing {
            let excess = abs(raw) - maxTrailing
            return -(maxTrailing + excess * 0.3)
        }

        return raw
    }

    private func handleDragEnd(_ value: DragGesture.Value) {
        let horizontal = value.translation.width
        let velocity = value.predictedEndTranslation.width - value.translation.width

        // Full swipe trigger (first action)
        if horizontal > fullSwipeThreshold && !leadingActions.isEmpty {
            leadingActions[0].action()
            HapticFeedback.medium()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                offset = 0
                activeSwipeSide = .none
            }
            return
        }
        if horizontal < -fullSwipeThreshold && !trailingActions.isEmpty {
            trailingActions[0].action()
            HapticFeedback.medium()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                offset = 0
                activeSwipeSide = .none
            }
            return
        }

        // Snap open or closed
        if horizontal > snapThreshold && !leadingActions.isEmpty && velocity >= 0 {
            offset = totalLeadingWidth
            activeSwipeSide = .leading
            HapticFeedback.light()
        } else if horizontal < -snapThreshold && !trailingActions.isEmpty && velocity <= 0 {
            offset = -totalTrailingWidth
            activeSwipeSide = .trailing
            HapticFeedback.light()
        } else {
            offset = 0
            activeSwipeSide = .none
        }
    }

    private func actionButton(_ action: SwipeAction) -> some View {
        Button {
            action.action()
            HapticFeedback.medium()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                offset = 0
                activeSwipeSide = .none
            }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: action.icon)
                    .font(.system(size: 18, weight: .semibold))
                Text(action.label)
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundColor(.white)
            .frame(width: actionWidth, height: 72)
            .background(action.color)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .padding(.horizontal, 2)
    }

    // MARK: - Public reset

    func resetSwipe() {
        offset = 0
        activeSwipeSide = .none
    }
}
