import SwiftUI

// MARK: - Shimmer Modifier

public struct ShimmerModifier: ViewModifier {
    @State private var offset: CGFloat = -200
    private let theme = ThemeManager.shared

    public init() {}

    public func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    colors: [
                        Color.clear,
                        theme.textMuted.opacity(0.3),
                        Color.clear
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: 120)
                .offset(x: offset)
                .onAppear {
                    withAnimation(
                        .linear(duration: 1.5)
                        .repeatForever(autoreverses: false)
                    ) {
                        offset = 400
                    }
                }
            )
            .clipped()
    }
}

extension View {
    public func skeletonShimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

// MARK: - Skeleton Shape

public struct SkeletonShape: View {
    private let width: CGFloat?
    private let height: CGFloat
    private let cornerRadius: CGFloat
    @ObservedObject private var theme = ThemeManager.shared

    public init(width: CGFloat? = nil, height: CGFloat = 16, cornerRadius: CGFloat = MeeshyRadius.md) {
        self.width = width
        self.height = height
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .fill(theme.textMuted.opacity(0.12))
            .frame(width: width, height: height)
            .skeletonShimmer()
    }
}

// MARK: - Skeleton Conversation Row

public struct SkeletonConversationRow: View {
    @ObservedObject private var theme = ThemeManager.shared

    public init() {}

    public var body: some View {
        HStack(spacing: 14) {
            // Avatar placeholder
            Circle()
                .fill(theme.textMuted.opacity(0.12))
                .frame(width: 48, height: 48)
                .skeletonShimmer()

            // Text lines
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    SkeletonShape(height: 14, cornerRadius: MeeshyRadius.sm)
                        .frame(maxWidth: .infinity)
                        .frame(width: UIScreen.main.bounds.width * 0.3)

                    Spacer()

                    // Timestamp placeholder
                    SkeletonShape(width: 28, height: 10, cornerRadius: 4)
                }

                SkeletonShape(height: 12, cornerRadius: MeeshyRadius.sm)
                    .frame(maxWidth: .infinity)
                    .frame(width: UIScreen.main.bounds.width * 0.5)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(theme.textMuted.opacity(0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(theme.textMuted.opacity(0.06), lineWidth: 1)
                )
        )
    }
}

// MARK: - Skeleton Message Bubble

public struct SkeletonMessageBubble: View {
    private let index: Int
    @ObservedObject private var theme = ThemeManager.shared

    public init(index: Int) {
        self.index = index
    }

    private var isLeft: Bool { index % 2 == 0 }

    private var bubbleWidth: CGFloat {
        let screenWidth = UIScreen.main.bounds.width
        let widths: [CGFloat] = [0.55, 0.72, 0.4, 0.65, 0.48, 0.78]
        let fraction = widths[index % widths.count]
        return screenWidth * fraction
    }

    private var bubbleHeight: CGFloat {
        let heights: [CGFloat] = [40, 56, 34, 48, 62, 38]
        return heights[index % heights.count]
    }

    public var body: some View {
        HStack {
            if !isLeft { Spacer(minLength: 50) }

            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.textMuted.opacity(0.12))
                .frame(width: bubbleWidth, height: bubbleHeight)
                .skeletonShimmer()

            if isLeft { Spacer(minLength: 50) }
        }
    }
}
