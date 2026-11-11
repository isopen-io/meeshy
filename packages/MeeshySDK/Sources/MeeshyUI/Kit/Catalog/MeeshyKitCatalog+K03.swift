#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK03 = MeeshyKitCatalogEntry(
        key: "K03",
        name: "MeeshySegmented",
        states: [
            MeeshyKitCatalogState(id: "deux", boardView: "S2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "deux-second", boardView: "A3", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "trois-long", boardView: "A10", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "trois-milieu", boardView: "A14", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "quatre", boardView: "A2", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "desactive", backdrop: .dark),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK03(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshySegmentedSpecimen(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : le choix posé sur un panneau opaque, comme dans sa
/// planche. L'état porte ses options, sa sélection initiale, son ton ; `presse`
/// fige l'appui sur le premier segment non courant.
private struct MeeshySegmentedSpecimen: View {
    let stateID: String
    let isPressed: Bool

    @Environment(\.colorScheme) private var colorScheme
    @State private var selection: Int

    init(stateID: String, isPressed: Bool) {
        self.stateID = stateID
        self.isPressed = isPressed
        _selection = State(initialValue: Self.spec(for: stateID).selected)
    }

    var body: some View {
        let spec = Self.spec(for: stateID)
        MeeshySegmented(
            "Choix",
            selection: $selection,
            options: spec.titles.enumerated().map { MeeshySegmentedOption(id: $0.offset, title: $0.element) },
            role: .choice,
            tone: spec.tone,
            pressed: isPressed ? spec.titles.indices.first { $0 != selection } : nil
        )
        .disabled(!spec.enabled)
        .frame(maxWidth: 320)
        .padding(MeeshySpacing.sm)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.lg).fill(panelFill))
    }

    private var panelFill: Color {
        MeeshyColors.backgroundPrimary(isDark: stateID == "theme" ? colorScheme == .dark : true)
    }

    private static func spec(for stateID: String) -> (titles: [String], selected: Int, tone: MeeshySegmentedTone, enabled: Bool) {
        switch stateID {
        case "deux": return (["Ajuster", "Remplir"], 0, .media, true)
        case "deux-second": return (["Fond", "Contour"], 1, .media, true)
        case "trois-long": return (["Tout", "Peau", "Éclairage du visage"], 0, .media, true)
        case "trois-milieu": return (["Uni", "Dégradé", "Image"], 1, .media, true)
        case "quatre": return (["Normal", "Italique", "Souligné", "Gras"], 3, .media, true)
        case "theme": return (["Clair", "Sombre"], 0, .theme, true)
        default: return (["Ajuster", "Remplir"], 0, .media, false)
        }
    }
}
#endif
