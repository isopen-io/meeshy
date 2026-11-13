import SwiftUI

/// **La bande de vignettes** (K19) : une rangée de vignettes à aperçu d'où l'on
/// choisit UNE option. Elle défile, se centre ou se replie en grille, cercle la
/// courante et s'estompe au bord derrière lequel il reste des vignettes.
///
/// Un composant CONTRÔLÉ et AGNOSTIQUE : `selection` appartient à l'hôte, qui
/// l'applique tout de suite ; la bande ne garde rien et ne connaît ni filtre, ni
/// look, ni cadre, ni police : l'aperçu est celui de `preview(tile, state)`,
/// rogné à la forme de la vignette. Aucune matière (le verre, la plaque ou la
/// pilule qui la portent viennent d'ailleurs), aucune chaîne fabriquée : l'hôte
/// passe titres, noms et aides, déjà traduits.
///
/// - Sans vignette, la bande ne rend rien, ni hauteur ni marge.
/// - `label` nomme le groupe pour le lecteur d'écran ; il est obligatoire.
/// - Une vignette sans titre doit porter un `accessibilityLabel`.
/// - `.disabled(_:)` désactive la bande entière.
/// - `underlay(geometry)` peint UNE surface de l'hôte sous les vignettes
///   visibles de la disposition `strip`, masquée à leur forme ; `geometry`
///   donne leurs cadres dans la zone visible.
/// - En carrousel, les noms sont ceux de la courante seule, sous la bande.
///
/// Les fermetures de l'hôte ne sont pas comparées : il les garde stables, et
/// signale un aperçu neuf par `MeeshyTile.previewVersion`.
public struct MeeshyTileStrip<ID: Hashable & Sendable, Preview: View, Underlay: View>: View {
    private let tiles: [MeeshyTile<ID>]
    private let selection: ID?
    private let label: String
    private let layout: MeeshyTileStripLayout
    private let tileSize: CGSize
    private let names: MeeshyTileNames
    private let selectionStyle: MeeshyTileSelectionStyle
    private let surface: MeeshyTileSurface
    private let inset: CGFloat
    private let revealsSelection: Bool
    private let isSolo: Bool
    private let haptic: MeeshyTileHaptic
    private let currentGestures: MeeshyTileCurrentGestures?
    private let onVisibleRange: ((ClosedRange<Int>?) -> Void)?
    private let onScrollingChange: ((Bool) -> Void)?
    private let onSelect: (ID) -> Void
    private let preview: (MeeshyTile<ID>, MeeshyTileState) -> Preview
    private let underlay: ((MeeshyTileStripGeometry) -> Underlay)?
    private var previewPressed: ID?

    @State private var viewport: CGFloat = 0
    /// Le décalage, derrière une référence que seul le calque de dessous
    /// observe : défiler ne redessine pas la bande.
    @State private var scrollOffset = MeeshyTileScrollOffset()
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @Environment(\.layoutDirection) private var layoutDirection

    public init(
        _ tiles: [MeeshyTile<ID>],
        selection: ID?,
        label: String,
        layout: MeeshyTileStripLayout = .strip,
        tileSize: CGSize = MeeshyTileMetrics.defaultSize,
        names: MeeshyTileNames = .each,
        selectionStyle: MeeshyTileSelectionStyle = .ring,
        surface: MeeshyTileSurface = .onMedia,
        inset: CGFloat = 0,
        revealsSelection: Bool = true,
        isSolo: Bool = false,
        haptic: MeeshyTileHaptic = .light,
        currentGestures: MeeshyTileCurrentGestures? = nil,
        onVisibleRange: ((ClosedRange<Int>?) -> Void)? = nil,
        onScrollingChange: ((Bool) -> Void)? = nil,
        onSelect: @escaping (ID) -> Void,
        preview: @escaping (MeeshyTile<ID>, MeeshyTileState) -> Preview,
        underlay: @escaping (MeeshyTileStripGeometry) -> Underlay
    ) {
        self.init(
            tiles, selection: selection, label: label, layout: layout, tileSize: tileSize, names: names,
            selectionStyle: selectionStyle, surface: surface, inset: inset, revealsSelection: revealsSelection,
            isSolo: isSolo, haptic: haptic, currentGestures: currentGestures, onVisibleRange: onVisibleRange,
            onScrollingChange: onScrollingChange, onSelect: onSelect, preview: preview, optionalUnderlay: underlay
        )
    }

    fileprivate init(
        _ tiles: [MeeshyTile<ID>],
        selection: ID?,
        label: String,
        layout: MeeshyTileStripLayout,
        tileSize: CGSize,
        names: MeeshyTileNames,
        selectionStyle: MeeshyTileSelectionStyle,
        surface: MeeshyTileSurface,
        inset: CGFloat,
        revealsSelection: Bool,
        isSolo: Bool,
        haptic: MeeshyTileHaptic,
        currentGestures: MeeshyTileCurrentGestures?,
        onVisibleRange: ((ClosedRange<Int>?) -> Void)?,
        onScrollingChange: ((Bool) -> Void)?,
        onSelect: @escaping (ID) -> Void,
        preview: @escaping (MeeshyTile<ID>, MeeshyTileState) -> Preview,
        optionalUnderlay: ((MeeshyTileStripGeometry) -> Underlay)?
    ) {
        assert(!label.isEmpty, "MeeshyTileStrip : le nom du groupe est obligatoire et non vide")
        assert(tiles.allSatisfy(\.hasAccessibleName), "MeeshyTileStrip : une vignette sans titre doit porter un accessibilityLabel")
        self.tiles = tiles
        self.selection = selection
        self.label = label
        self.layout = layout
        self.tileSize = tileSize
        self.names = names
        self.selectionStyle = selectionStyle
        self.surface = surface
        self.inset = inset
        self.revealsSelection = revealsSelection
        self.isSolo = isSolo
        self.haptic = haptic
        self.currentGestures = currentGestures
        self.onVisibleRange = onVisibleRange
        self.onScrollingChange = onScrollingChange
        self.onSelect = onSelect
        self.preview = preview
        self.underlay = optionalUnderlay
    }

    /// Fige une vignette « pressée » : l'instantané et le catalogue ne tiennent
    /// pas un doigt sur l'écran.
    func previewing(pressed id: ID?) -> MeeshyTileStrip {
        var copy = self
        copy.previewPressed = id
        return copy
    }

    @ViewBuilder
    public var body: some View {
        let shown = MeeshyTileStripRule.shown(tiles, selection: selection, isSolo: isSolo)
        if !shown.isEmpty {
            content(shown)
        }
    }

    // MARK: - Dispositions

    @ViewBuilder
    private func content(_ shown: [MeeshyTile<ID>]) -> some View {
        switch layout {
        case .strip:
            VStack(spacing: MeeshyTileMetrics.nameGap) {
                scroller(shown)
                currentName(shown)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
        case .grid(let columns):
            VStack(spacing: MeeshyTileMetrics.nameGap) {
                grid(shown, columns: max(1, columns))
                currentName(shown)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
        case .carousel(let dimsNeighbours):
            MeeshyTileCarousel(
                tiles: shown, selection: selection, label: label, dimsNeighbours: dimsNeighbours,
                configuration: configuration(fillsWidth: false),
                showsCurrentName: MeeshyTileStripRule.nameUnderStrip(names, layout: layout), previewPressed: previewPressed,
                revealsSelection: revealsSelection, isSolo: isSolo, gestures: currentGestures,
                onSelect: onSelect, preview: preview
            )
        }
    }

    private func configuration(fillsWidth: Bool) -> MeeshyTileConfiguration {
        MeeshyTileConfiguration(
            tileSize: tileSize, namesOnTile: MeeshyTileStripRule.namesOnEachTile(names, layout: layout),
            selectionStyle: selectionStyle, surface: surface,
            haptic: haptic, fillsWidth: fillsWidth
        )
    }

    // MARK: - Bande

    /// La cible déborde l'aperçu et le cercle le déborde de 4 : la réserve vit
    /// DANS le défilement (sans quoi il la couperait), et se retire dehors pour
    /// que la bande garde l'encombrement des vignettes.
    private func scroller(_ shown: [MeeshyTile<ID>]) -> some View {
        let reserve = MeeshyTileMetrics.reserve
        return ScrollViewReader { proxy in
            ZStack(alignment: .topLeading) {
                underlayLayer(shown)
                MeeshyFadingScrollView(axis: .horizontal, fade: MeeshyTileRecipe.edgeFade) {
                    LazyHStack(spacing: MeeshyTileMetrics.spacing) { cells(shown, fillsWidth: false) }
                        .padding(.horizontal, inset + reserve)
                        .padding(.vertical, reserve)
                        .modifier(observer(count: shown.count))
                }
                .scrollDisabled(isSolo)
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { viewport = $0 }
            .padding(.horizontal, -reserve)
            .padding(.vertical, -reserve)
            .onAppear { reveal(proxy, to: selection, animated: false) }
            .adaptiveOnChange(of: selection) { _, current in reveal(proxy, to: current, animated: true) }
        }
    }

    private func geometry(count: Int) -> MeeshyTileStripGeometry {
        MeeshyTileStripGeometry(
            tileSize: tileSize, spacing: MeeshyTileMetrics.spacing, inset: inset + MeeshyTileMetrics.reserve,
            count: count, viewport: viewport
        )
    }

    private func observer(count: Int) -> MeeshyTileScrollObserver {
        let offset = scrollOffset
        let writesOffset: ((CGFloat) -> Void)? = underlay == nil ? nil : { offset.move(to: $0) }
        return MeeshyTileScrollObserver(
            geometry: geometry(count: count),
            viewport: viewport,
            isRightToLeft: layoutDirection == .rightToLeft,
            onVisibleRange: onVisibleRange,
            onScrollingChange: onScrollingChange,
            onOffset: writesOffset
        )
    }

    @ViewBuilder
    private func underlayLayer(_ shown: [MeeshyTile<ID>]) -> some View {
        if let underlay {
            MeeshyTileUnderlayLayer(
                offset: scrollOffset, geometry: geometry(count: shown.count),
                isRightToLeft: layoutDirection == .rightToLeft, underlay: underlay
            )
        }
    }

    // MARK: - Grille

    private func grid(_ shown: [MeeshyTile<ID>], columns: Int) -> some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: MeeshyTileMetrics.spacing), count: columns),
            spacing: MeeshyTileMetrics.rowSpacing
        ) {
            cells(shown, fillsWidth: true)
        }
        .padding(.horizontal, inset)
    }

    // MARK: - Cellules

    private func cells(_ shown: [MeeshyTile<ID>], fillsWidth: Bool) -> some View {
        let configuration = configuration(fillsWidth: fillsWidth)
        return ForEach(shown) { tile in
            MeeshyTileCell(
                spec: configuration.spec(
                    for: tile, isSelected: tile.id == selection, isNeighbour: false,
                    listensToGestures: currentGestures != nil, forcedPressed: previewPressed == tile.id
                ),
                preview: preview, onSelect: onSelect, gestures: currentGestures
            )
            .equatable()
            .id(tile.id)
        }
    }

    // MARK: - Nom de la courante

    @ViewBuilder
    private func currentName(_ shown: [MeeshyTile<ID>]) -> some View {
        if MeeshyTileStripRule.nameUnderStrip(names, layout: layout),
           let tile = shown.first(where: { $0.id == selection }), !tile.title.isEmpty {
            MeeshyTileCurrentName(title: tile.title, surface: surface)
        }
    }

    // MARK: - Montrer la courante

    /// Centrée : sans animation à l'apparition, en 250 ms à chaque changement,
    /// immédiate sous « réduire les animations ».
    private func reveal(_ proxy: ScrollViewProxy, to target: ID?, animated: Bool) {
        guard revealsSelection, !isSolo, let target else { return }
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        let animation = animated
            ? MeeshyMotion.animation(.easeInOut(duration: MeeshyTileRecipe.revealDuration), reduce: reduce)
            : nil
        withAnimation(animation) {
            proxy.scrollTo(target, anchor: .center)
        }
    }
}

// MARK: - Sans emplacement de dessous

public extension MeeshyTileStrip where Underlay == EmptyView {
    init(
        _ tiles: [MeeshyTile<ID>],
        selection: ID?,
        label: String,
        layout: MeeshyTileStripLayout = .strip,
        tileSize: CGSize = MeeshyTileMetrics.defaultSize,
        names: MeeshyTileNames = .each,
        selectionStyle: MeeshyTileSelectionStyle = .ring,
        surface: MeeshyTileSurface = .onMedia,
        inset: CGFloat = 0,
        revealsSelection: Bool = true,
        isSolo: Bool = false,
        haptic: MeeshyTileHaptic = .light,
        currentGestures: MeeshyTileCurrentGestures? = nil,
        onVisibleRange: ((ClosedRange<Int>?) -> Void)? = nil,
        onScrollingChange: ((Bool) -> Void)? = nil,
        onSelect: @escaping (ID) -> Void,
        preview: @escaping (MeeshyTile<ID>, MeeshyTileState) -> Preview
    ) {
        self.init(
            tiles, selection: selection, label: label, layout: layout, tileSize: tileSize, names: names,
            selectionStyle: selectionStyle, surface: surface, inset: inset, revealsSelection: revealsSelection,
            isSolo: isSolo, haptic: haptic, currentGestures: currentGestures, onVisibleRange: onVisibleRange,
            onScrollingChange: onScrollingChange, onSelect: onSelect, preview: preview, optionalUnderlay: nil
        )
    }
}

// MARK: - Le nom de la courante

/// Le nom de la courante, seul, sous la bande : une ligne qui grandit avec le
/// Dynamic Type et que le lecteur d'écran n'entend pas (la valeur du groupe le dit).
struct MeeshyTileCurrentName: View {
    let title: String
    let surface: MeeshyTileSurface

    @Environment(\.colorScheme) var colorScheme
    @ScaledMetric(relativeTo: .footnote) var size: CGFloat = MeeshyTileMetrics.nameFontSize

    var body: some View {
        let ink = MeeshyTileRecipe.resolve(surface: surface, selectionStyle: .ring, isSelected: false)
            .toneColor(isDark: colorScheme == .dark)
        return Text(verbatim: title)
            .font(Font.system(size: size, weight: .semibold))
            .foregroundStyle(ink)
            .lineLimit(1)
            .accessibilityHidden(true)
    }
}

// MARK: - Les réglages d'une cellule

/// Ce que toutes les cellules d'une bande partagent : une valeur, pour que la
/// bande et le carrousel construisent leurs cellules de la même façon.
struct MeeshyTileConfiguration {
    let tileSize: CGSize
    /// Le nom sous chaque vignette : jamais en carrousel, qui le lit sous la bande.
    let namesOnTile: Bool
    let selectionStyle: MeeshyTileSelectionStyle
    let surface: MeeshyTileSurface
    let haptic: MeeshyTileHaptic
    let fillsWidth: Bool

    func spec<ID: Hashable & Sendable>(
        for tile: MeeshyTile<ID>,
        isSelected: Bool,
        isNeighbour: Bool,
        listensToGestures: Bool,
        forcedPressed: Bool
    ) -> MeeshyTileCellSpec<ID> {
        MeeshyTileCellSpec(
            tile: tile, isSelected: isSelected, tileSize: tileSize, names: namesOnTile ? .each : .none,
            selectionStyle: selectionStyle, surface: surface, haptic: haptic, isNeighbour: isNeighbour,
            listensToGestures: listensToGestures && isSelected, fillsWidth: fillsWidth, forcedPressed: forcedPressed
        )
    }
}
