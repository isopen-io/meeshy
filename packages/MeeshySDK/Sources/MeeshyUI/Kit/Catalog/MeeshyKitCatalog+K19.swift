#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK19 = MeeshyKitCatalogEntry(
        key: "K19",
        name: "MeeshyTileStrip",
        states: [
            MeeshyKitCatalogState(id: "bande", boardView: "O6", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "bande-deborde", backdrop: .dark),
            MeeshyKitCatalogState(id: "bande-milieu", backdrop: .dark),
            MeeshyKitCatalogState(id: "carrousel", boardView: "A10", backdrop: .dark),
            MeeshyKitCatalogState(id: "grille", boardView: "S4", backdrop: .dark),
            MeeshyKitCatalogState(id: "plein", boardView: "A2", backdrop: .dark),
            MeeshyKitCatalogState(id: "attente", backdrop: .dark),
            MeeshyKitCatalogState(id: "desactive", backdrop: .dark),
            MeeshyKitCatalogState(id: "solo", backdrop: .dark),
            MeeshyKitCatalogState(id: "theme", backdrop: .light),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK19(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyTileStripSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : la vraie bande, vivante (la sélection se change au
/// toucher), figée « pressée » pour la tuile du même nom. Les aperçus sont des
/// dégradés de la palette, aucune image n'est embarquée.
private struct MeeshyTileStripSample: View {
    let stateID: String
    let isPressed: Bool

    @Environment(\.colorScheme) private var colorScheme
    @State private var selection: String?

    private static let width: CGFloat = 320

    init(stateID: String, isPressed: Bool) {
        self.stateID = stateID
        self.isPressed = isPressed
        _selection = State(initialValue: Self.initialSelection(stateID))
    }

    var body: some View {
        sample
            .frame(width: Self.width)
            .modifier(MeeshyTileStripSampleTheme(isThemed: stateID == "theme", isDark: colorScheme == .dark))
    }

    @ViewBuilder
    private var sample: some View {
        switch stateID {
        case "bande-deborde", "bande-milieu": overflowing
        case "carrousel": carousel
        case "grille": grid
        case "plein": fill
        case "attente": waiting
        case "desactive": strip(Self.looks).disabled(true)
        case "solo": strip(Self.looks, isSolo: true)
        case "theme": strip(Self.looks, surface: .theme)
        default: strip(Self.looks)
        }
    }

    private var overflowing: some View {
        strip(Self.manyLooks, label: "Looks")
    }

    private var carousel: some View {
        MeeshyTileStrip(
            Self.looks, selection: selection, label: "Effets",
            layout: .carousel(dimsNeighbours: true), tileSize: CGSize(width: 48, height: 62), names: .current,
            onSelect: { selection = $0 }, preview: gradient
        )
    }

    private var grid: some View {
        MeeshyTileStrip(
            Self.manyLooks, selection: selection, label: "Transitions",
            layout: .grid(columns: 4), tileSize: CGSize(width: 70, height: 56),
            onSelect: { selection = $0 }, preview: gradient
        )
    }

    private var fill: some View {
        MeeshyTileStrip(
            Self.fonts, selection: selection, label: "Polices",
            tileSize: CGSize(width: 52, height: 52), names: .none, selectionStyle: .fill,
            onSelect: { selection = $0 }, preview: sampleText
        )
    }

    private var waiting: some View {
        MeeshyTileStrip(
            Self.waitingLooks, selection: selection, label: "Looks",
            tileSize: CGSize(width: 50, height: 64),
            onSelect: { selection = $0 }, preview: { _, _ in Color.clear }
        )
    }

    private func strip(
        _ tiles: [MeeshyTile<String>],
        label: String = "Looks",
        isSolo: Bool = false,
        surface: MeeshyTileSurface = .onMedia
    ) -> some View {
        MeeshyTileStrip(
            tiles, selection: selection, label: label,
            tileSize: CGSize(width: 50, height: 64), surface: surface, isSolo: isSolo,
            onSelect: { selection = $0 }, preview: gradient
        )
        .previewing(pressed: isPressed ? tiles.first { $0.id != selection }?.id : nil)
    }

    // MARK: - Aperçus

    private func gradient(_ tile: MeeshyTile<String>, _ state: MeeshyTileState) -> some View {
        let colors = Self.palette[Self.index(of: tile.id) % Self.palette.count]
        return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private func sampleText(_ tile: MeeshyTile<String>, _ state: MeeshyTileState) -> some View {
        Text(verbatim: "Aa")
            .font(Font.system(size: MeeshyFont.titleSize, weight: .bold))
            .foregroundStyle(state.isSelected ? MeeshyColors.indigo950 : MeeshyColors.onMedia)
    }

    // MARK: - Données

    private static let looks: [MeeshyTile<String>] = ["Aucun", "Chaud", "Froid", "Mono", "Vif", "Doux", "Film"].map { MeeshyTile(id: $0, title: $0) }

    private static let manyLooks: [MeeshyTile<String>] = [
        "Aucun", "Chaud", "Froid", "Mono", "Vif", "Doux", "Film", "Aube", "Nuit", "Sépia", "Néon", "Mat",
    ].map { MeeshyTile(id: $0, title: $0) }

    private static let fonts: [MeeshyTile<String>] = ["Classique", "Moderne", "Fin", "Gras", "Script"].map {
        MeeshyTile(id: $0, title: "", accessibilityLabel: $0)
    }

    private static let waitingLooks: [MeeshyTile<String>] = ["Aucun", "Chaud", "Froid", "Mono", "Vif"].map {
        MeeshyTile(id: $0, title: $0, placeholderSystemImage: "photo")
    }

    private static let palette: [[Color]] = [
        [MeeshyColors.indigo300, MeeshyColors.indigo600],
        [MeeshyColors.amber500, MeeshyColors.indigo700],
        [MeeshyColors.indigo400, MeeshyColors.indigo900],
        [MeeshyColors.indigo200, MeeshyColors.indigo500],
        [MeeshyColors.indigo600, MeeshyColors.indigo950],
        [MeeshyColors.indigo100, MeeshyColors.indigo400],
    ]

    private static func index(of id: String) -> Int {
        let all = manyLooks.map(\.id) + fonts.map(\.id)
        return all.firstIndex(of: id) ?? 0
    }

    private static func initialSelection(_ stateID: String) -> String? {
        switch stateID {
        case "bande-milieu": return "Sépia"
        case "plein": return "Moderne"
        case "grille": return "Froid"
        case "carrousel": return "Mono"
        default: return "Chaud"
        }
    }
}

/// Le thème applicatif de l'état `theme` : la bande y est jugée sur le fond de l'app.
private struct MeeshyTileStripSampleTheme: ViewModifier {
    let isThemed: Bool
    let isDark: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if isThemed {
            content
                .padding(MeeshySpacing.sm)
                .background(MeeshyColors.backgroundPrimary(isDark: isDark))
        } else {
            content
        }
    }
}
#endif
