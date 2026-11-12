import SwiftUI

/// **La pilule de verre du bas** (K10) : UN bloc de verre qui porte une rangée
/// d'emplacements, grandit vers le haut quand on lui confie un `above`, et se
/// retire par son bord quand l'hôte le demande. Atome opaque, par pureté du
/// SDK : l'appelant fournit les boutons, l'action principale et le dessus ; la
/// pilule ne connaît ni composer, ni appel, ni singleton nommé Meeshy.
///
/// - `buttons(size)` : la rangée, du début à la fin ; elle reçoit la taille que
///   la loi d'ajustement a retenue (48, 44, 40, puis 40 qui défile) et la remet
///   à ses boutons K02.
/// - `primary` : l'action principale, toujours en dernier, jamais dans le défilement.
/// - `above` : ce qui vit au-dessus de la rangée DANS le même verre (K11).
///
/// Elle ne porte aucun geste, ne joue aucune haptique, n'observe aucun magasin
/// et ne lit pas le ton de l'hôte : seule la surface de K01 le lit. Le verre est
/// demandé UNE fois (`MeeshyGlassPillMorph`) ; sur iOS 26, les verres voisins de
/// la rangée se fondent dans un seul groupe. Sans bouton, sans action principale
/// ni dessus, elle ne rend rien : jamais une bande vide.
public struct MeeshyGlassPill<Buttons: View, Primary: View, Above: View>: View {
    private let label: String
    private let presence: MeeshyGlassPillPresence
    private let layout: MeeshyGlassPillLayout
    private let tone: MeeshyGlassTone?
    private let showsDivider: Bool
    private let expandedMaxWidth: CGFloat
    private let onRevive: (() -> Void)?
    private let buttons: (MeeshyGlassButtonSize) -> Buttons
    private let primary: Primary
    private let above: Above

    @Environment(\.layoutDirection) private var layoutDirection

    public init(
        label: String,
        presence: MeeshyGlassPillPresence = .shown,
        layout: MeeshyGlassPillLayout = .hug,
        tone: MeeshyGlassTone? = nil,
        showsDivider: Bool = false,
        expandedMaxWidth: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth,
        onRevive: (() -> Void)? = nil,
        @ViewBuilder buttons: @escaping (MeeshyGlassButtonSize) -> Buttons,
        @ViewBuilder primary: () -> Primary,
        @ViewBuilder above: () -> Above
    ) {
        assert(!label.isEmpty, "MeeshyGlassPill : le nom du groupe est obligatoire et non vide")
        self.label = label
        self.presence = presence
        self.layout = layout
        self.tone = tone
        self.showsDivider = showsDivider
        self.expandedMaxWidth = expandedMaxWidth
        self.onRevive = onRevive
        self.buttons = buttons
        self.primary = primary()
        self.above = above()
    }

    // MARK: Contenu

    /// Aucun verre sans rien à porter (loi 13).
    static var hasContent: Bool { hasButtons || hasPrimary || hasAbove }
    private static var hasButtons: Bool { Buttons.self != EmptyView.self }
    private static var hasPrimary: Bool { Primary.self != EmptyView.self }
    private static var hasAbove: Bool { Above.self != EmptyView.self }

    public var body: some View {
        if Self.hasContent {
            toned(sized(content))
                .modifier(MeeshyGlassPillMorph(
                    tone: tone,
                    density: Self.hasAbove ? .dense : .regular,
                    showsRow: presence.showsRow
                ))
                .frame(maxWidth: .infinity)
                .modifier(MeeshyGlassPillStowModifier(presence: presence, onRevive: onRevive))
                .accessibilityElement(children: .contain)
                .accessibilityLabel(label)
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
            above
            divider
            if presence.showsRow, Self.hasButtons || Self.hasPrimary {
                rowSection
                    .transition(rowTransition)
            }
        }
    }

    // MARK: Largeur et ton

    /// Avec un dessus, 560 au plus ; répartie, son plafond ; serrée au contenu,
    /// rien : la rangée choisit sa taille sous la largeur que l'hôte offre.
    @ViewBuilder
    private func sized<V: View>(_ view: V) -> some View {
        if let cap = widthCap {
            view.frame(maxWidth: .infinity).frame(maxWidth: cap)
        } else {
            view
        }
    }

    private var widthCap: CGFloat? {
        if Self.hasAbove { return expandedMaxWidth }
        if case .spread(let maxWidth) = layout { return maxWidth }
        return nil
    }

    @ViewBuilder
    private func toned<V: View>(_ view: V) -> some View {
        if let tone {
            view.meeshyGlassTone(tone)
        } else {
            view
        }
    }

    // MARK: Filet

    @ViewBuilder
    private var divider: some View {
        if showsDivider, Self.hasAbove, presence.showsRow {
            Rectangle()
                .fill(MeeshyColors.onMedia.opacity(MeeshyGlassPillRecipe.dividerOpacity))
                .frame(height: MeeshyGlassPillRecipe.dividerHeight)
                .padding(.horizontal, MeeshyGlassPillRecipe.dividerInset)
                .accessibilityHidden(true)
        }
    }

    private var rowTransition: AnyTransition {
        .opacity.combined(with: .move(edge: .bottom))
    }

    // MARK: Rangée

    /// La rangée au repos : les quatre candidats de la loi d'ajustement, dans
    /// l'ordre. `ViewThatFits` retient le premier dont la largeur idéale tient ;
    /// le dernier défile. Les candidats sont CONSTRUITS ici, sur le fil principal.
    private var rowSection: some View {
        let sizes = MeeshyGlassPillRecipe.sizes
        return MeeshyGlassGroup(spacing: MeeshySpacing.sm) {
            ViewThatFits(in: .horizontal) {
                rowBlock(size: sizes[0], scrolls: false)
                rowBlock(size: sizes[1], scrolls: false)
                rowBlock(size: sizes[2], scrolls: false)
                rowBlock(size: sizes[2], scrolls: true)
            }
        }
    }

    private func rowBlock(size: MeeshyGlassButtonSize, scrolls: Bool) -> some View {
        HStack(spacing: MeeshyGlassPillRecipe.gap) {
            if Self.hasButtons {
                if scrolls {
                    MeeshyFadingScrollView(axis: .horizontal, fade: MeeshyGlassPillRecipe.edgeFade) {
                        buttonRow(size)
                    }
                } else {
                    buttonRow(size)
                }
            }
            primarySlot
        }
        .padding(.horizontal, MeeshyGlassPillRecipe.inset)
        .padding(.vertical, verticalInset)
    }

    private func buttonRow(_ size: MeeshyGlassButtonSize) -> some View {
        MeeshyGlassPillRowLayout(
            gap: MeeshyGlassPillRecipe.gap,
            spreads: isSpread,
            isRightToLeft: layoutDirection == .rightToLeft
        ) {
            buttons(size)
        }
    }

    private var primarySlot: some View {
        primary
    }

    private var isSpread: Bool {
        if case .spread = layout { return true }
        return false
    }

    private var verticalInset: CGFloat {
        isSpread ? MeeshyGlassPillRecipe.spreadVerticalInset : MeeshyGlassPillRecipe.inset
    }
}

// MARK: - Les inits sans emplacement vide

public extension MeeshyGlassPill where Primary == EmptyView, Above == EmptyView {
    init(
        label: String,
        presence: MeeshyGlassPillPresence = .shown,
        layout: MeeshyGlassPillLayout = .hug,
        tone: MeeshyGlassTone? = nil,
        showsDivider: Bool = false,
        expandedMaxWidth: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth,
        onRevive: (() -> Void)? = nil,
        @ViewBuilder buttons: @escaping (MeeshyGlassButtonSize) -> Buttons
    ) {
        self.init(
            label: label, presence: presence, layout: layout, tone: tone, showsDivider: showsDivider,
            expandedMaxWidth: expandedMaxWidth, onRevive: onRevive, buttons: buttons,
            primary: { EmptyView() }, above: { EmptyView() }
        )
    }
}

public extension MeeshyGlassPill where Above == EmptyView {
    init(
        label: String,
        presence: MeeshyGlassPillPresence = .shown,
        layout: MeeshyGlassPillLayout = .hug,
        tone: MeeshyGlassTone? = nil,
        showsDivider: Bool = false,
        expandedMaxWidth: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth,
        onRevive: (() -> Void)? = nil,
        @ViewBuilder buttons: @escaping (MeeshyGlassButtonSize) -> Buttons,
        @ViewBuilder primary: () -> Primary
    ) {
        self.init(
            label: label, presence: presence, layout: layout, tone: tone, showsDivider: showsDivider,
            expandedMaxWidth: expandedMaxWidth, onRevive: onRevive, buttons: buttons,
            primary: primary, above: { EmptyView() }
        )
    }
}

public extension MeeshyGlassPill where Primary == EmptyView {
    init(
        label: String,
        presence: MeeshyGlassPillPresence = .shown,
        layout: MeeshyGlassPillLayout = .hug,
        tone: MeeshyGlassTone? = nil,
        showsDivider: Bool = false,
        expandedMaxWidth: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth,
        onRevive: (() -> Void)? = nil,
        @ViewBuilder buttons: @escaping (MeeshyGlassButtonSize) -> Buttons,
        @ViewBuilder above: () -> Above
    ) {
        self.init(
            label: label, presence: presence, layout: layout, tone: tone, showsDivider: showsDivider,
            expandedMaxWidth: expandedMaxWidth, onRevive: onRevive, buttons: buttons,
            primary: { EmptyView() }, above: above
        )
    }
}

public extension MeeshyGlassPill where Buttons == EmptyView {
    /// Un dessus seul (les sous-titres des appels, R12) : pas de rangée.
    init(
        label: String,
        presence: MeeshyGlassPillPresence = .shown,
        layout: MeeshyGlassPillLayout = .hug,
        tone: MeeshyGlassTone? = nil,
        showsDivider: Bool = false,
        expandedMaxWidth: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth,
        onRevive: (() -> Void)? = nil,
        @ViewBuilder primary: () -> Primary,
        @ViewBuilder above: () -> Above
    ) {
        self.init(
            label: label, presence: presence, layout: layout, tone: tone, showsDivider: showsDivider,
            expandedMaxWidth: expandedMaxWidth, onRevive: onRevive, buttons: { _ in EmptyView() },
            primary: primary, above: above
        )
    }
}

// MARK: - La rangée

/// La rangée des boutons : serrée (chacun à sa taille, séparés de `gap`) ou
/// répartie (chacun centré dans une case de largeur égale). Les positions
/// viennent de `MeeshyGlassPillRecipe.rowOffsets`, miroitées en RTL.
struct MeeshyGlassPillRowLayout: Layout {
    let gap: CGFloat
    let spreads: Bool
    let isRightToLeft: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let natural = MeeshyGlassPillRecipe.rowWidth(widths: sizes.map(\.width), gap: gap)
        let height = sizes.map(\.height).max() ?? 0
        guard spreads, let proposed = proposal.width, proposed.isFinite else {
            return CGSize(width: natural, height: height)
        }
        return CGSize(width: max(natural, proposed), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let offsets = MeeshyGlassPillRecipe.rowOffsets(
            widths: sizes.map(\.width), gap: gap, available: bounds.width, spreads: spreads
        )
        for (index, subview) in subviews.enumerated() {
            let size = sizes[index]
            let x = isRightToLeft ? bounds.maxX - offsets[index] - size.width : bounds.minX + offsets[index]
            subview.place(at: CGPoint(x: x, y: bounds.midY), anchor: .leading, proposal: ProposedViewSize(size))
        }
    }
}
