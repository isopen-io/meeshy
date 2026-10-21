import SwiftUI
import Combine

// MARK: - Shimmer Modifier

/// Tenue « squelette » du reflet de chargement. Délègue à `LoadingSheen`,
/// l'unique reflet animé du SDK (#9869).
public struct ShimmerModifier: ViewModifier {
    private let theme = ThemeManager.shared

    public init() {}

    public func body(content: Content) -> some View {
        content.modifier(LoadingSheen(style: .skeleton(tint: theme.textMuted.opacity(MeeshyOpacity.medium))))
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
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme

    public init(width: CGFloat? = nil, height: CGFloat = 16, cornerRadius: CGFloat = MeeshyRadius.md) {
        self.width = width
        self.height = height
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .fill(theme.textMuted.opacity(MeeshyOpacity.light))
            .frame(width: width, height: height)
            .skeletonShimmer()
            .accessibilityHidden(true)
    }
}

// MARK: - Skeleton Conversation Row

public struct SkeletonConversationRow: View {
    /// La fenêtre qui porte la vue (Stage Manager, Split View) — la fenêtre clé en repli.
    @Environment(\.sceneWindowSize) var sceneWindowSize
    private var hostWidth: CGFloat { SceneWindowSize.resolve(sceneWindowSize, fallback: WindowMetrics.windowSize).width }
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public var body: some View {
        HStack(spacing: MeeshySpacing.mdPlus) {
            // Avatar placeholder
            Circle()
                .fill(theme.textMuted.opacity(MeeshyOpacity.light))
                .frame(width: 48, height: 48)
                .skeletonShimmer()

            // Text lines
            VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
                HStack {
                    SkeletonShape(height: 14, cornerRadius: MeeshyRadius.sm)
                        .frame(maxWidth: .infinity)
                        .frame(width: min(hostWidth * 0.3, 180))

                    Spacer()

                    // Timestamp placeholder
                    SkeletonShape(width: 28, height: 10, cornerRadius: 4)
                }

                SkeletonShape(height: 12, cornerRadius: MeeshyRadius.sm)
                    .frame(maxWidth: .infinity)
                    .frame(width: min(hostWidth * 0.5, 280))
            }
        }
        .padding(MeeshySpacing.mdPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus)
                .fill(theme.textMuted.opacity(MeeshyOpacity.faint))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus)
                        .stroke(theme.textMuted.opacity(MeeshyOpacity.faint), lineWidth: 1)
                )
        )
        .accessibilityHidden(true)
    }
}

// MARK: - Skeleton Message Bubble

public struct SkeletonMessageBubble: View {
    /// La fenêtre qui porte la vue (Stage Manager, Split View) — la fenêtre clé en repli.
    @Environment(\.sceneWindowSize) var sceneWindowSize
    private var hostWidth: CGFloat { SceneWindowSize.resolve(sceneWindowSize, fallback: WindowMetrics.windowSize).width }
    private let index: Int
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme

    public init(index: Int) {
        self.index = index
    }

    private var isLeft: Bool { index % 2 == 0 }

    private var bubbleWidth: CGFloat {
        let screenWidth = hostWidth
        let widths: [CGFloat] = [0.55, 0.72, 0.4, 0.65, 0.48, 0.78]
        let fraction = widths[index % widths.count]
        // Cap skeleton bubble width on iPad — the iPhone fractions
        // produce absurdly wide placeholders on a 1024pt screen.
        return min(screenWidth * fraction, 320)
    }

    private var bubbleHeight: CGFloat {
        let heights: [CGFloat] = [40, 56, 34, 48, 62, 38]
        return heights[index % heights.count]
    }

    public var body: some View {
        HStack {
            if !isLeft { Spacer(minLength: 50) }

            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.textMuted.opacity(MeeshyOpacity.light))
                .frame(width: bubbleWidth, height: bubbleHeight)
                .skeletonShimmer()

            if isLeft { Spacer(minLength: 50) }
        }
        .accessibilityHidden(true)
    }
}
