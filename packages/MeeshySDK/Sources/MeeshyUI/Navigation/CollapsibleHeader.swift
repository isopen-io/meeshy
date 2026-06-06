import SwiftUI

public enum CollapsibleHeaderMetrics {
    public static var expandedHeight: CGFloat { 64 }
    public static var collapsedHeight: CGFloat { 44 }
}

public struct CollapsibleHeader<LeadingContent: View, TitleContent: View, TrailingContent: View>: View {
    let title: String
    let subtitle: String?
    let scrollOffset: CGFloat
    let showBackButton: Bool
    let onBack: (() -> Void)?
    let titleColor: Color
    let backArrowColor: Color
    let backgroundColor: Color
    /// When `true`, the title cross-fades from large/leading (expanded) to a
    /// small horizontally-centred title (collapsed) — the iOS large-title nav
    /// pattern. Defaults to `false` so existing screens keep the leading title.
    let centerTitleOnCollapse: Bool
    /// When `true`, the header surface (blur + tint) fades from readable at the
    /// top to fully transparent at the bottom edge, so list rows scrolling under
    /// the lower edge stay visible. Defaults to `false` (uniform surface).
    let fadeOutBackground: Bool
    let leading: (() -> LeadingContent)?
    let titleView: (() -> TitleContent)?
    let trailing: () -> TrailingContent

    public static var expandedHeight: CGFloat { 64 }
    public static var collapsedHeight: CGFloat { 44 }

    public init(
        title: String,
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        centerTitleOnCollapse: Bool = false,
        fadeOutBackground: Bool = false,
        @ViewBuilder leading: @escaping () -> LeadingContent,
        @ViewBuilder titleView: @escaping () -> TitleContent,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.centerTitleOnCollapse = centerTitleOnCollapse
        self.fadeOutBackground = fadeOutBackground
        self.leading = leading
        self.titleView = titleView
        self.trailing = trailing
    }

    public var progress: CGFloat {
        min(1, max(0, -scrollOffset / 60))
    }

    private var headerHeight: CGFloat {
        lerp(Self.expandedHeight, Self.collapsedHeight, progress)
    }

    private var titleSize: CGFloat {
        lerp(24, 17, progress)
    }

    private var titleWeight: Font.Weight {
        progress < 0.5 ? .bold : .semibold
    }

    private var titleBottomPadding: CGFloat {
        lerp(6, 0, progress)
    }

    private var backArrowSize: CGFloat {
        lerp(20, 16, progress)
    }

    private var showExpandedSubtitle: Bool {
        subtitle != nil && progress < 0.7
    }

    private var showCollapsedSubtitle: Bool {
        subtitle != nil && progress > 0.7
    }

    private func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat {
        a + (b - a) * t
    }

    private func makeSubtitleText(_ text: String, size: CGFloat, opacity: Double) -> Text {
        Text(text)
            .font(.system(size: size))
            .foregroundColor(titleColor.opacity(opacity))
    }

    public var body: some View {
        VStack(spacing: 0) {
            ZStack {
                if centerTitleOnCollapse {
                    centeredCollapsedTitle
                        .opacity(Double(progress))
                        .frame(height: headerHeight, alignment: .bottom)
                        .padding(.bottom, titleBottomPadding)
                }
                HStack(alignment: .center, spacing: 0) {
                if showBackButton {
                    backButton
                }

                if let leading {
                    leading()
                        .scaleEffect(lerp(1.0, 0.8, progress), anchor: .leading)
                        .padding(.leading, showBackButton ? 0 : 8)
                }

                VStack(alignment: .leading, spacing: 2) {
                    if let titleView {
                        titleView()
                            .scaleEffect(lerp(1.0, 0.65, progress), anchor: .leading)
                    } else {
                        Text(title)
                            .font(.system(size: titleSize, weight: titleWeight, design: .rounded))
                            .foregroundColor(titleColor)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }

                    if showExpandedSubtitle {
                        makeSubtitleText(subtitle ?? "", size: lerp(15, 12, progress), opacity: 0.6)
                            .lineLimit(1)
                            .opacity(Double(1.0 - min(1.0, progress / 0.6)))
                    }
                }
                .padding(.leading, showBackButton ? 0 : 16)
                .opacity(centerTitleOnCollapse ? Double(1 - progress) : 1)

                if showCollapsedSubtitle {
                    makeSubtitleText(subtitle ?? "", size: 12, opacity: 0.5)
                        .lineLimit(1)
                        .padding(.leading, 8)
                        .opacity(max(0, (progress - 0.7) / 0.3))
                }

                Spacer(minLength: 8)

                trailing()
                    .frame(minWidth: 44, minHeight: 44)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, titleBottomPadding)
                .frame(height: headerHeight, alignment: .bottom)
            }

            Divider()
                .opacity(Double(progress) * 0.3)
        }
        .frame(maxWidth: .infinity)
        .background(headerBackground)
    }

    /// Header surface: `.ultraThinMaterial` blur + a `backgroundColor` tint. When
    /// `fadeOutBackground` is set, both the blur and the tint are masked to fade
    /// from readable at the top to transparent at the bottom edge, so list rows
    /// scrolling under the lower edge remain visible. Otherwise the surface is the
    /// uniform legacy gradient (unchanged for the other screens).
    private var headerBackground: some View {
        Rectangle()
            .fill(.ultraThinMaterial)
            .overlay(LinearGradient(stops: backgroundTintStops, startPoint: .top, endPoint: .bottom))
            .mask(Rectangle().fill(LinearGradient(stops: backgroundMaskStops, startPoint: .top, endPoint: .bottom)))
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)
    }

    private var backgroundTintStops: [Gradient.Stop] {
        if fadeOutBackground {
            return [
                .init(color: backgroundColor.opacity(0.75), location: 0),
                .init(color: backgroundColor.opacity(0.45), location: 0.5),
                .init(color: backgroundColor.opacity(0.0), location: 1.0),
            ]
        }
        return [
            .init(color: backgroundColor.opacity(0.5), location: 0),
            .init(color: backgroundColor.opacity(0.65), location: 0.8),
            .init(color: backgroundColor.opacity(0.7), location: 1.0),
        ]
    }

    private var backgroundMaskStops: [Gradient.Stop] {
        if fadeOutBackground {
            return [
                .init(color: .black, location: 0),
                .init(color: .black, location: 0.5),
                .init(color: .clear, location: 1.0),
            ]
        }
        // Solid mask = no-op (keeps the legacy uniform surface).
        return [
            .init(color: .black, location: 0),
            .init(color: .black, location: 1.0),
        ]
    }

    @ViewBuilder
    private var centeredCollapsedTitle: some View {
        if let titleView {
            titleView().scaleEffect(0.6)
        } else {
            Text(title)
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(titleColor)
                .lineLimit(1)
        }
    }

    private var backButton: some View {
        Button {
            HapticFeedback.light()
            onBack?()
        } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: backArrowSize, weight: .semibold))
                .foregroundColor(backArrowColor)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Retour")
    }
}

// MARK: - Convenience init (no custom titleView, no leading — backward compatible)

extension CollapsibleHeader where LeadingContent == EmptyView, TitleContent == EmptyView {
    public init(
        title: String,
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        centerTitleOnCollapse: Bool = false,
        fadeOutBackground: Bool = false,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.centerTitleOnCollapse = centerTitleOnCollapse
        self.fadeOutBackground = fadeOutBackground
        self.leading = nil
        self.titleView = nil
        self.trailing = trailing
    }
}

// MARK: - Convenience init (custom titleView, no leading)

extension CollapsibleHeader where LeadingContent == EmptyView {
    public init(
        title: String,
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        centerTitleOnCollapse: Bool = false,
        fadeOutBackground: Bool = false,
        @ViewBuilder titleView: @escaping () -> TitleContent,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.centerTitleOnCollapse = centerTitleOnCollapse
        self.fadeOutBackground = fadeOutBackground
        self.leading = nil
        self.titleView = titleView
        self.trailing = trailing
    }
}
