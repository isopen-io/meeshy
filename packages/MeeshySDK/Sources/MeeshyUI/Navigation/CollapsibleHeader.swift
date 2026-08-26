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

    /// Gouttière des chromes RONDS du header. Un disque n'occupe pas son
    /// carré : sa marge optique se mesure au point le plus proche du bord,
    /// pas à un cadre. À la marge de texte (16 pt) il affleure. Alignée à
    /// l'origine sur celle des boutons flottants isolés
    /// (`FreeFloatingButtonsContainer.minEdgePadding` = 20 pt), mais un
    /// troisième signalement (2026-08-16, (+) de la liste de conversation)
    /// a montré que 20 pt ne suffit pas pour la PAIRE de disques que
    /// `AdaptiveGlassContainer` fond en un seul halo `GlassEffectContainer`
    /// (iOS 26) — le reflet spéculaire du groupe déborde visuellement le
    /// frame de layout, réduisant l'écart perçu. Portée désormais PROPRE au
    /// header (ne touche plus les boutons flottants isolés, jamais signalés).
    nonisolated public static var roundChromeEdgeGutter: CGFloat { 28 }

    /// Marge SUPPLÉMENTAIRE réservée aux boutons d'action, à droite. S'ajoute
    /// à `barHorizontalPadding` pour atteindre `roundChromeEdgeGutter` : à
    /// 12 pt puis à 16 pt, un cercle de verre de 40 pt affleurait encore le
    /// bord de l'écran (retours user 2026-08-14 puis 2026-08-15 sur (+) de la
    /// liste et (map) du feed).
    ///
    /// Vit ICI et pas dans chaque écran : posée par call site, elle dérive —
    /// le feed iPad portait son propre `.padding(.trailing, 12)`, la liste de
    /// conversations rien du tout, et c'est cette dérive qui a laissé deux
    /// boutons au bord.
    nonisolated public static var trailingActionsInset: CGFloat {
        roundChromeEdgeGutter - barHorizontalPadding
    }

    /// Écart entre la fente du titre (ou la trail qui l'occupe) et la grappe
    /// d'actions. Porté par les ACTIONS, JAMAIS par un `Spacer` frère : la
    /// fente réclame `maxWidth: .infinity` avec `layoutPriority(1)` et se sert
    /// avant les priorités 0, à qui il ne reste alors rien à proposer — or un
    /// `Spacer` à qui l'on propose 0 rend quand même son `minLength`, et la
    /// rangée dépasse d'autant la largeur proposée. Réservé avec les actions
    /// (priorité 2), cet écart ne peut rien faire déborder.
    nonisolated public static var titleActionsGap: CGFloat { 8 }

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
    /// `.storyTrayCompact` rings (36pt avatar + 6pt story ring) plus breathing
    /// room. Shared with the app-side band so the bar and its content can never
    /// drift apart.
    ///
    /// 56 → 48 le 2026-08-22, avec le passage des anneaux de 44 à 36 : la
    /// bande réservait plus de hauteur que son contenu n'en occupait, et ce
    /// surplus poussait les cercles contre le bord bas de la barre, là où le
    /// sticker de section les rognait.
    nonisolated public static var inlineAccessoryHeight: CGFloat { 48 }

    /// Dégagement de FIN DE PISTE de l'accessoire pleine largeur.
    ///
    /// La trail court désormais jusqu'au bord droit de l'écran et passe SOUS le
    /// chrome d'actions. Sans encart de fin, son dernier anneau vient au repos
    /// exactement là où les boutons le couvrent : atteignable, jamais visible.
    /// L'encart lui rend de quoi défiler au-delà.
    ///
    /// Il est POSÉ, pas mesuré : le header ne connaît pas le nombre de boutons
    /// que chaque écran lui donne, et une mesure par `PreferenceKey` ferait
    /// dépendre le contenu de la piste d'une largeur qu'elle-même n'influence
    /// pas — de la complexité pour un gain nul. La valeur couvre la
    /// configuration la plus large en service (deux disques de 44 pt groupés par
    /// `AdaptiveGlassContainer` + la gouttière de bord) ; sur un écran à un seul
    /// bouton, le surplus n'est qu'un peu de course de défilement en trop.
    nonisolated public static var accessoryTrailingClearance: CGFloat {
        2 * 44 + roundChromeEdgeGutter
    }

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

                // Fente du titre. Il CÈDE toujours la place à la trail (même
                // fondu croisé qu'avant) — mais la trail ne vit plus DANS la
                // fente : une piste horizontale posée entre le titre et les
                // actions s'arrête à leur bord, alors que le défilement doit
                // aller d'un bout à l'autre de l'écran (retour user 2026-08-18).
                // Elle est désormais une couche PLEINE LARGEUR posée SOUS la
                // rangée (`.background` plus bas), et le chrome droit flotte
                // dessus.
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
                    // …et il doit lâcher le GESTE, pas seulement la vue. Un
                    // `Text` à `opacity(0)` reste hit-testable en SwiftUI : posé
                    // DEVANT la trail (qui vit maintenant dans le `.background`
                    // de la rangée), il avalerait les taps des premiers anneaux
                    // — exactement ceux qu'on atteint sans faire défiler.
                    .allowsHitTesting(inlineAccessoryReveal < 0.5)
                }
                .padding(.leading, showBackButton ? 0 : 16)

                if showCollapsedSubtitle {
                    makeSubtitleText(subtitle ?? "", size: 12, opacity: 0.5)
                        .lineLimit(1)
                        .padding(.leading, 8)
                        .opacity(max(0, (progress - 0.7) / 0.3))
                        // Même raison que le titre : purement informatif, il ne
                        // prend jamais le geste destiné à la trail derrière lui.
                        .allowsHitTesting(false)
                }

                // `minLength: 0` — l'écart titre ↔ actions est porté par les
                // actions (`titleActionsGap`). Ce `Spacer` ne sert plus qu'à
                // pousser les actions à droite quand la fente hugge son texte
                // (écrans sans trail) ; toute longueur minimale ici ferait
                // déborder la rangée dès que la fente est élastique.
                Spacer(minLength: 0)

                // Chrome de taille FIXE. Il ne dispute plus la largeur à
                // personne : la trail est passée SOUS la rangée, hors layout.
                // La priorité et la gouttière restent — elles sont ce qui a sorti
                // le (+) de la liste et le (map) du feed de derrière le bord
                // (retour user 2026-08-14, trois signalements), et rien ne dit
                // qu'un futur occupant élastique de la fente ne reviendra pas.
                trailing()
                    .frame(minWidth: 44, minHeight: 44)
                    .layoutPriority(2)
                    // L'écart avec le titre (ou la trail qui l'occupe) appartient
                    // aux ACTIONS, pas au `Spacer` : réservé avec elles au titre
                    // de la priorité 2, il ne peut pas élargir la rangée — et il
                    // ne se glisse pas entre le titre et son sous-titre replié,
                    // ce qu'un padding porté par la fente aurait fait.
                    .padding(.leading, CollapsibleHeaderMetrics.titleActionsGap)
                    .padding(.trailing, CollapsibleHeaderMetrics.trailingActionsInset)
            }
            .padding(.horizontal, CollapsibleHeaderMetrics.barHorizontalPadding)
            .padding(.bottom, titleBottomPadding)
            // La trail, BORD À BORD, DERRIÈRE la rangée.
            //
            // `.background` ne participe pas au layout : la piste reçoit la
            // largeur ENTIÈRE de la barre — marges de la rangée comprises — sans
            // rien pousser, là où une fente voisine des actions s'arrêtait à leur
            // bord. Et parce qu'elle est DESSOUS, les boutons restent au-dessus :
            // le défilement passe derrière eux, ce qui est exactement le geste
            // demandé (« de bout d'écran à bout d'écran »).
            //
            // Rendue sans autre condition que la présence du slot : la couche
            // porte son propre seuil de montage (aucun anneau matérialisé au
            // repos) et un `if` sur la révélation churnerait l'identité
            // structurelle du sous-arbre à chaque passage du seuil.
            .background(alignment: .leading) {
                if let titleAccessory {
                    titleAccessory()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .opacity(Double(inlineAccessoryReveal))
                        // Sous les boutons, la piste ne doit pas leur voler le
                        // geste tant qu'elle n'est pas réellement là.
                        .allowsHitTesting(inlineAccessoryReveal > 0.5)
                }
            }
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
