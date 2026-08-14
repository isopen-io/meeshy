import SwiftUI

/// Métriques du header repliable. TOUT y est `nonisolated` : ce sont des
/// constantes de layout et une courbe pure, lisibles depuis n'importe quel
/// contexte — y compris les suites de tests, qui tournent hors du MainActor
/// alors que `MeeshyUI` isole tout dessus par défaut (SE-0466).
public enum CollapsibleHeaderMetrics {
    nonisolated public static var expandedHeight: CGFloat { 64 }
    nonisolated public static var collapsedHeight: CGFloat { 44 }

    /// Marge horizontale de la rangée de la barre.
    nonisolated public static var barHorizontalPadding: CGFloat { 12 }

    /// Marge SUPPLÉMENTAIRE réservée aux boutons d'action, à droite. S'ajoute
    /// à `barHorizontalPadding` pour atteindre les 16 pt de marge standard
    /// iOS : à 12 pt, un cercle de verre de 40 pt affleurait le bord de
    /// l'écran (retour user 2026-08-14 sur (+) de la liste et (map) du feed).
    ///
    /// Vit ICI et pas dans chaque écran : posée par call site, elle dérive —
    /// le feed iPad portait son propre `.padding(.trailing, 12)`, la liste de
    /// conversations rien du tout, et c'est cette dérive qui a laissé deux
    /// boutons au bord.
    nonisolated public static var trailingActionsInset: CGFloat { 4 }

    /// Reveal curve [0, 1] for a pinned accessory that takes over the TITLE's
    /// slot inside the header bar (e.g. a compact story trail that replaces
    /// « Meeshy Feed » / « Meeshy Chats » once the full-size trail has scrolled
    /// up under the header). `scrollOffset` is the same negative offset the
    /// header consumes (0 at rest, more negative as content scrolls up);
    /// `start`/`end` are the scroll distances (positive points) at which the
    /// accessory begins and finishes revealing. Pure so it is testable off the
    /// MainActor under MeeshyUI's default isolation.
    nonisolated public static func pinnedAccessoryReveal(
        scrollOffset: CGFloat,
        start: CGFloat,
        end: CGFloat
    ) -> CGFloat {
        let scrolled = -scrollOffset
        guard end > start else { return scrolled >= end ? 1 : 0 }
        return min(1, max(0, (scrolled - start) / (end - start)))
    }

    /// Scroll distance (points) at which the in-bar accessory starts taking the
    /// title's place. Layout-derived: the full-size trail (120pt + 8pt of top
    /// padding) sits under the 64pt expanded header, so it is fully hidden
    /// behind the collapsed bar after ~148pt of travel — the hand-off runs over
    /// the last ~70pt of that.
    nonisolated public static var inlineAccessoryRevealStart: CGFloat { 78 }

    /// Scroll distance (points) at which the in-bar accessory has fully taken
    /// the title's place and the title is gone.
    nonisolated public static var inlineAccessoryRevealEnd: CGFloat { 148 }

    /// Height of the accessory content itself once fully revealed — one row of
    /// `.storyTrayCompact` rings (44pt avatar + 6pt story ring) plus breathing
    /// room. Shared with the app-side band so the bar and its content can never
    /// drift apart.
    nonisolated public static var inlineAccessoryHeight: CGFloat { 56 }

    /// Bar height once the accessory has fully taken the title slot. Taller
    /// than `collapsedHeight` (a 44pt title line cannot host a 50pt ring) and
    /// still shorter than `expandedHeight`, so the header only ever shrinks as
    /// the user scrolls.
    nonisolated public static var accessoryCollapsedHeight: CGFloat { 60 }

    /// Reveal curve of the in-bar accessory over the canonical band. Single
    /// source of truth for BOTH sides of the cross-fade: the header fades the
    /// title out with it, the app-side band fades itself in with it.
    nonisolated public static func inlineAccessoryReveal(scrollOffset: CGFloat) -> CGFloat {
        pinnedAccessoryReveal(
            scrollOffset: scrollOffset,
            start: inlineAccessoryRevealStart,
            end: inlineAccessoryRevealEnd
        )
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
    /// and covered by the same header surface — a row that is ALWAYS there
    /// (e.g. the sub-tab bar of the discovery hub). Type-erased (`AnyView`) so
    /// adding it doesn't introduce a 5th generic parameter across every call
    /// site; it is a single, stable slot rendered once — not a list cell — so
    /// the structural-identity cost of `AnyView` is irrelevant here.
    let accessory: (() -> AnyView)?

    /// Optional content that takes over the TITLE's slot inside the bar as the
    /// content scrolls (e.g. a compact story trail). It cross-fades with the
    /// title over `CollapsibleHeaderMetrics.inlineAccessoryReveal`, so a
    /// scrolled header shows the trail — not a shrunken « Meeshy Feed » —
    /// immediately left of the trailing actions (directive user 2026-08-13).
    ///
    /// Deliberately NOT the same slot as `accessory`: one EXCHANGES with the
    /// title and only exists once scrolled, the other is a permanent second
    /// row. Folding them together would have made the discovery sub-tabs fade
    /// away with the scroll and land on top of their own title.
    let titleAccessory: (() -> AnyView)?

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
        accessory: (() -> AnyView)? = nil,
        titleAccessory: (() -> AnyView)? = nil
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
        self.titleAccessory = titleAccessory
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

    /// Cross-fade driver of the title ↔ in-bar accessory hand-off. `0` while the
    /// title owns its slot, `1` once the accessory has fully replaced it.
    private var inlineAccessoryReveal: CGFloat {
        guard titleAccessory != nil else { return 0 }
        return CollapsibleHeaderMetrics.inlineAccessoryReveal(scrollOffset: scrollOffset)
    }

    /// Collapsed height — 1.3× the standard 44pt when a center reveal is present, so
    /// the inserted avatar + name + stats chip gets vertical room and can sit
    /// vertically centered over the opaque part of the gradient (the fade-to-clear
    /// bottom edge is preserved). With an in-bar accessory the bar grows to
    /// `accessoryCollapsedHeight` as the accessory reveals — a 44pt title line
    /// cannot host a 50pt story ring. Otherwise the standard height.
    private var effectiveCollapsedHeight: CGFloat {
        if hasReveal { return Self.collapsedHeight * 1.3 }
        guard titleAccessory != nil else { return Self.collapsedHeight }
        return lerp(
            Self.collapsedHeight,
            CollapsibleHeaderMetrics.accessoryCollapsedHeight,
            inlineAccessoryReveal
        )
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

                // Title ↔ in-bar accessory: ONE slot, two occupants. The title
                // hands the slot over instead of surviving as a shrunken label
                // above a second row.
                ZStack(alignment: .leading) {
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
                    .opacity(Double(1 - inlineAccessoryReveal))
                    // Once handed over, the title is not just invisible — it is
                    // gone from VoiceOver too, otherwise the trail's rings would
                    // be announced behind a heading nobody can see.
                    .accessibilityHidden(inlineAccessoryReveal > 0.5)

                    if let titleAccessory {
                        // Rendered unconditionally: the slot owns its own mount
                        // threshold (it must not materialise its rings at rest),
                        // and a conditional branch here would churn the
                        // structural identity of that subtree on every crossing.
                        titleAccessory()
                            .opacity(Double(inlineAccessoryReveal))
                    }
                }
                .padding(.leading, showBackButton ? 0 : 16)
                // With an accessory the slot claims the whole width left of the
                // trailing actions — a horizontal trail needs the room a title
                // never asked for. Without one, the title keeps hugging its text.
                .frame(maxWidth: titleAccessory == nil ? nil : CGFloat.infinity, alignment: .leading)
                // …and it claims it AGAINST the `Spacer` below, which is flexible
                // too: an HStack splits its slack evenly between flexible
                // children, so without this priority half the width the trail was
                // given would have gone to an empty gutter before the actions.
                .layoutPriority(titleAccessory == nil ? 0 : 1)

                if showCollapsedSubtitle {
                    makeSubtitleText(subtitle ?? "", size: 12, opacity: 0.5)
                        .lineLimit(1)
                        .padding(.leading, 8)
                        .opacity(max(0, (progress - 0.7) / 0.3))
                }

                Spacer(minLength: 8)

                // Chrome de taille FIXE, servi avant la fente du titre : celle-ci
                // réclame `maxWidth: .infinity` avec `layoutPriority(1)` dès
                // qu'elle porte la trail, et prenait donc toute la largeur —
                // les boutons débordaient de la barre par la droite, hors du
                // viewport ((+) de la liste, (map) du feed, retour user
                // 2026-08-14). La trail est l'occupant ÉLASTIQUE des deux :
                // c'est à elle de prendre ce qui reste, pas l'inverse.
                trailing()
                    .frame(minWidth: 44, minHeight: 44)
                    .layoutPriority(2)
                    .padding(.trailing, CollapsibleHeaderMetrics.trailingActionsInset)
            }
            .padding(.horizontal, CollapsibleHeaderMetrics.barHorizontalPadding)
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

            // Permanent in-header row (e.g. a sub-tab bar) — rendered inside the
            // header VStack, below the bar, so it shares the same surface. This
            // is NOT where the story trail goes: that one takes the title's slot.
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
    ///
    /// Le fondu est un fondu ALPHA du verre : la surface est donc composée hors
    /// écran, et cette couche est recomposée de façon instable — le header
    /// clignote entre gris opaque et transparent ~toutes les 1,5 s, sans le
    /// moindre re-render SwiftUI (mesuré au simulateur iOS 18.2 : 3 bascules en
    /// 5 s, amplitude 1,2 de luminance ; `.compositingGroup()` divise l'amplitude
    /// par deux sans supprimer les bascules). Ce dégradé est CONSERVÉ tel quel
    /// par choix produit — clignotement assumé, ne pas « corriger » en peignant
    /// le fondu : cela alourdit le bas du header (arbitrage 2026-07-27).
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
            Image(systemName: "chevron.backward")
                .font(.system(size: backArrowSize, weight: .semibold))
                .foregroundColor(backArrowColor)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .module))
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
        accessory: (() -> AnyView)? = nil,
        titleAccessory: (() -> AnyView)? = nil
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
        self.titleAccessory = titleAccessory
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
        accessory: (() -> AnyView)? = nil,
        titleAccessory: (() -> AnyView)? = nil
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
        self.titleAccessory = titleAccessory
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
        self.titleAccessory = nil
    }
}
