#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK04 = MeeshyKitCatalogEntry(
        key: "K04",
        name: "MeeshyChipRow",
        states: [
            MeeshyKitCatalogState(id: "simple", boardView: "S1", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "icone", boardView: "A2", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "deborde", boardView: "A12", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "deborde-milieu", backdrop: .dark),
            MeeshyKitCatalogState(id: "replie", boardView: "A16", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "multiple", boardView: "A17", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "egal", backdrop: .dark),
            MeeshyKitCatalogState(id: "theme", backdrop: .light),
            MeeshyKitCatalogState(id: "compact", backdrop: .dark),
            MeeshyKitCatalogState(id: "desactive", backdrop: .dark),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK04(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyChipRowSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : la vraie rangée, vivante (la sélection se
/// change au toucher), figée « pressée » pour la tuile du même nom.
private struct MeeshyChipRowSample: View {
    let stateID: String
    let isPressed: Bool

    @Environment(\.colorScheme) private var colorScheme
    @State private var selection: Set<String>

    private static let width: CGFloat = 320

    init(stateID: String, isPressed: Bool) {
        self.stateID = stateID
        self.isPressed = isPressed
        _selection = State(initialValue: Self.initialSelection(stateID))
    }

    var body: some View {
        row.frame(width: Self.width)
            .modifier(MeeshyChipRowSampleTheme(isThemed: stateID == "theme", isDark: colorScheme == .dark))
    }

    @ViewBuilder
    private var row: some View {
        switch stateID {
        case "icone": icons
        case "deborde", "deborde-milieu": overflowing
        case "replie": wrapped
        case "multiple": multiple
        case "egal": equal
        case "theme": themed
        case "compact": compact
        case "desactive": disabled
        default: simple
        }
    }

    private var simple: some View {
        chipRow(Self.effects, label: "Effet d'ouverture")
    }

    private var icons: some View {
        chipRow(
            [
                MeeshyChip(id: "all", title: "Tout", systemImage: "globe"),
                MeeshyChip(id: "favorites", title: "Favoris", systemImage: "star"),
                MeeshyChip(id: "search", title: "", systemImage: "magnifyingglass", accessibilityLabel: "Rechercher"),
                MeeshyChip(id: "language", title: "Langue : Français", trailing: .chevron, kind: .menu, hint: "Ouvre la liste"),
            ],
            label: "Effets"
        )
    }

    private var overflowing: some View {
        chipRow(Self.themes, label: "Thèmes")
    }

    private var wrapped: some View {
        chipRow(Self.mentionModes, label: "Mode de la mention", layout: .wrap)
    }

    private var multiple: some View {
        let chips = Self.audiences.map { chip in
            selection.contains(chip.id)
                ? MeeshyChip(id: chip.id, title: chip.title, trailing: .remove, hint: "Retire le destinataire")
                : chip
        }
        return chipRow(chips, label: "Destinataires", mode: .multiple, layout: .wrap)
    }

    private var equal: some View {
        chipRow(
            [MeeshyChip(id: "audio", title: "Audio"), MeeshyChip(id: "video", title: "Vidéo")],
            label: "Type d'appel", layout: .equal
        )
    }

    private var themed: some View {
        chipRow(Self.effects, label: "Effet d'ouverture", surface: .theme)
    }

    private var compact: some View {
        chipRow(Self.effects, label: "Effet d'ouverture", size: .compact)
    }

    private var disabled: some View {
        chipRow(Self.effects, label: "Effet d'ouverture").disabled(true)
    }

    private func chipRow(
        _ chips: [MeeshyChip<String>],
        label: String,
        mode: MeeshyChipRowMode = .single,
        layout: MeeshyChipRowLayout = .scroll,
        surface: MeeshyChipRowSurface = .onMedia,
        size: MeeshyChipRowSize = .regular
    ) -> some View {
        MeeshyChipRow(
            chips, selection: selection, label: label, mode: mode, layout: layout, surface: surface, size: size,
            onChange: { next, _ in selection = next }
        )
        .previewing(pressed: isPressed ? chips.first { !selection.contains($0.id) && $0.kind == .choice }?.id : nil)
    }

    // MARK: - Données

    private static let effects = [
        MeeshyChip(id: "none", title: "Aucun"),
        MeeshyChip(id: "fade", title: "Fondu"),
        MeeshyChip(id: "zoom", title: "Zoom"),
        MeeshyChip(id: "slide", title: "Glisse"),
    ]

    private static let themes = [
        "Tout", "Nature", "Ville", "Fête", "Sport", "Voyage", "Cuisine", "Musique", "Art", "Cinéma", "Jeux", "Mode",
    ].map { MeeshyChip(id: $0, title: $0) }

    private static let mentionModes = [
        MeeshyChip(id: "all", title: "Tout le monde"),
        MeeshyChip(id: "friends", title: "Mes amis"),
        MeeshyChip(id: "none", title: "Personne"),
    ]

    private static let audiences = [
        "Amis", "Famille", "Collègues", "Voisins", "Équipe",
    ].map { MeeshyChip(id: $0, title: $0) }

    private static func initialSelection(_ stateID: String) -> Set<String> {
        switch stateID {
        case "deborde-milieu": return ["Cuisine"]
        case "icone": return ["all"]
        case "deborde": return ["Tout"]
        case "replie": return ["friends"]
        case "multiple": return ["Amis", "Équipe"]
        case "egal": return ["audio"]
        default: return ["fade"]
        }
    }
}

/// Le thème applicatif de l'état `theme` : la rangée y est jugée sur le fond de l'app.
private struct MeeshyChipRowSampleTheme: ViewModifier {
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
