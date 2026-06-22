import SwiftUI

public enum CollapsibleHeaderMetrics {
    public static var expandedHeight: CGFloat { 64 }
    public static var collapsedHeight: CGFloat { 44 }

    /// Reveal curve [0, 1] for a pinned accessory rendered *below* the header
    /// bar (e.g. a compact story trail that takes over once the full-size one
    /// has scrolled up under the header). `scrollOffset` is the same negative
    /// offset the header consumes (0 at rest, more negative as content scrolls
    /// up); `start`/`end` are the scroll distances (positive points) at which
    /// the accessory begins and finishes revealing. Pure so it is testable off
    /// the MainActor under MeeshyUI's default isolation.
    nonisolated public static func pinnedAccessoryReveal(
        scrollOffset: CGFloat,
        start: CGFloat,
        end: CGFloat
    ) -> CGFloat {
        let scrolled = -scrollOffset
        guard end > start else { return scrolled >= end ? 1 : 0 }
        return min(1, max(0, (scrolled - start) / (end - start)))
    }
}

public struct CollapsibleHeader<LeadingContent: View, TitleContent: View, TrailingContent: View, CenterContent: View>: View {
    let title: String
    let subtitle: String?
    let scrollOffset: CGFloat
    let showBackButton: Bool
    let onBack: (() -> Void)?
    let titleColor: Color
    let backArrowColor: Color
    let backgroundColor: Color
    let leading: (() -> LeadingContent)?
    let titleView: (() -> TitleContent)?
    let trailing: () -> TrailingContent
    let centerReveal: (() -> CenterContent)?
    /// Optional content rendered *inside* the header, below the title/actions bar
    /// and covered by the same header surface (e.g. a compact story trail). Type-
    /// erased (`AnyView`) so adding it doesn't introduce a 5th generic parameter
    /// across every call site; it is a single, stable slot rendered once — not a
    /// list cell — so the structural-identity cost of `AnyView` is irrelevant here.
    let accessory: (() -> AnyView)?

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
        @ViewBuilder leading: @escaping () -> LeadingContent,
        @ViewBuilder titleView: @escaping () -> TitleContent,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() },
        accessory: (() -> AnyView)? = nil
    ) where CenterContent == EmptyView {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.leading = leading
        self.titleView = titleView
        self.trailing = trailing
        self.centerReveal = nil
        self.accessory = accessory
    }

    public var progress: CGFloat {
        min(1, max(0, -scrollOffset / 60))
    }

    /// Reveal curve for the centered slot. Stays fully hidden during the first
    /// 60% of the collapse, then fades linearly to fully visible at full
    /// collapse — gives the "author appears once the inline header scrolled
    /// away" feel (style X). Pure + `nonisolated` so it is testable off the
    /// MainActor under MeeshyUI's default isolation.
    nonisolated public static func revealOpacity(forProgress progress: CGFloat) -> CGFloat {
        let start: CGFloat = 0.6
        guard progress > start else { return 0 }
        return min(1, (progress - start) / (1 - start))
    }

    /// `true` when a centered reveal slot (e.g. the post-author chip) is supplied.
    private var hasReveal: Bool { centerReveal != nil }

    /// Collapsed height — 1.3× the standard 44pt when a center reveal is present, so
    /// the inserted avatar + name + stats chip gets vertical room and can sit
    /// vertically centered over the opaque part of the gradient (the fade-to-clear
    /// bottom edge is preserved). Non-reveal headers keep the standard height.
    private var effectiveCollapsedHeight: CGFloat {
        hasReveal ? Self.collapsedHeight * 1.3 : Self.collapsedHeight
    }

    private var headerHeight: CGFloat {
        lerp(Self.expandedHeight, effectiveCollapsedHeight, progress)
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
            // With a reveal the chip is vertically centered in the taller header
            // (the bottom edge stays faded/transparent); otherwise the title sits
            // at the bottom, near the scroll content, as before.
            .frame(height: headerHeight, alignment: hasReveal ? .center : .bottom)
            .overlay(alignment: hasReveal ? .center : .bottom) {
                if let centerReveal {
                    centerReveal()
                        .padding(.horizontal, 48)   // réserve l'espace du back button (gauche) + trailing (droite)
                        .padding(.bottom, hasReveal ? 0 : titleBottomPadding)
                        .opacity(Double(Self.revealOpacity(forProgress: progress)))
                        .offset(y: lerp(6, 0, Self.revealOpacity(forProgress: progress)))
                        .allowsHitTesting(Self.revealOpacity(forProgress: progress) > 0.5)
                        .accessibilityHidden(Self.revealOpacity(forProgress: progress) < 0.5)
                }
            }

            // In-header accessory (e.g. compact story trail) — rendered inside
            // the header VStack, below the bar, so it shares the same surface.
            if let accessory {
                accessory()
            }

            Divider()
                .opacity(Double(progress) * 0.3)
        }
        .frame(maxWidth: .infinity)
        .background(headerBackground)
    }

    /// Header surface — generalised for ALL screens using this header: an
    /// `.ultraThinMaterial` blur + a `backgroundColor` tint, both masked to fade
    /// from a readable blur at the top to fully transparent at the bottom edge, so
    /// the scroll content (list rows, etc.) passing under the lower edge stays
    /// visible instead of being clipped by an opaque bar.
    private var headerBackground: some View {
        Rectangle()
            .fill(.ultraThinMaterial)
            .overlay(
                LinearGradient(
                    stops: [
                        .init(color: backgroundColor.opacity(0.75), location: 0),
                        .init(color: backgroundColor.opacity(0.45), location: 0.5),
                        .init(color: backgroundColor.opacity(0.0), location: 1.0),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .mask(
                Rectangle().fill(
                    LinearGradient(
                        stops: [
                            .init(color: .black, location: 0),
                            .init(color: .black, location: 0.5),
                            .init(color: .clear, location: 1.0),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            )
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)
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

extension CollapsibleHeader where LeadingContent == EmptyView, TitleContent == EmptyView, CenterContent == EmptyView {
    public init(
        title: String,
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() },
        accessory: (() -> AnyView)? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.leading = nil
        self.titleView = nil
        self.trailing = trailing
        self.centerReveal = nil
        self.accessory = accessory
    }
}

// MARK: - Convenience init (custom titleView, no leading)

extension CollapsibleHeader where LeadingContent == EmptyView, CenterContent == EmptyView {
    public init(
        title: String,
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder titleView: @escaping () -> TitleContent,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() },
        accessory: (() -> AnyView)? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.leading = nil
        self.titleView = titleView
        self.trailing = trailing
        self.centerReveal = nil
        self.accessory = accessory
    }
}

// MARK: - Convenience init (centered reveal slot, no leading, no left title)

extension CollapsibleHeader where LeadingContent == EmptyView, TitleContent == EmptyView {
    public init(
        title: String = "",
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder centerReveal: @escaping () -> CenterContent,
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
        self.leading = nil
        self.titleView = nil
        self.trailing = trailing
        self.centerReveal = centerReveal
        self.accessory = nil
    }
}
