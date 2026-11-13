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

/// L'échantillon d'un état : le choix posé sur un panneau opaque, aux libellés et
/// à la sélection de sa vue de la planche (S2, A3, A10, A14, A2), à la largeur
/// d'un panneau de téléphone ; `presse` fige l'appui sur le premier segment non courant.
private struct MeeshySegmentedSpecimen: View {
    let stateID: String
    let isPressed: Bool

    private static let trackWidth: CGFloat = 320

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
            role: Self.role(for: stateID),
            tone: spec.tone,
            pressed: isPressed ? spec.titles.indices.first { $0 != selection } : nil
        )
        .disabled(!spec.enabled)
        .frame(width: Self.trackWidth)
        .padding(MeeshySpacing.sm)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.lg).fill(panelFill))
    }

    private var panelFill: Color {
        MeeshyColors.backgroundPrimary(isDark: stateID == "theme" ? colorScheme == .dark : true)
    }

    /// `tabs` pour ce qui change le contenu voisin (A3, A10), `choice` sinon.
    private static func role(for stateID: String) -> MeeshySegmentedRole {
        ["deux-second", "trois-long"].contains(stateID) ? .tabs : .choice
    }

    private static func spec(for stateID: String) -> (titles: [String], selected: Int, tone: MeeshySegmentedTone, enabled: Bool) {
        switch stateID {
        case "deux": return (["Ajuster", "Remplir"], 0, .media, true)
        case "deux-second": return (["Texte", "Contour"], 1, .media, true)
        case "trois-long": return (["Filtres", "Cadres", "Effets de visage"], 0, .media, true)
        case "trois-milieu": return (["Sur la scène", "Fond de la scène", "Pièce du post"], 1, .media, true)
        case "quatre": return (["Fin", "Normal", "Semi-gras", "Gras"], 3, .media, true)
        case "theme": return (["Clair", "Sombre"], 0, .theme, true)
        default: return (["Ajuster", "Remplir"], 0, .media, false)
        }
    }
}
#endif
