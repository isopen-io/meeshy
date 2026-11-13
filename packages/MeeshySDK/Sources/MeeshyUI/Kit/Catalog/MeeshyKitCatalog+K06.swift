#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK06 = MeeshyKitCatalogEntry(
        key: "K06",
        name: "MeeshyToggleRow",
        states: [
            MeeshyKitCatalogState(id: "action", boardView: "R11", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "sous-titre", boardView: "A17", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "sans-icone", boardView: "O10", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "bascule-ouverte", boardView: "R11", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "bascule-fermee", boardView: "A15", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "coche", boardView: "A18", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "case", boardView: "R7", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "chevron", boardView: "A14", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "valeur", boardView: "A15", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "destructif", boardView: "R11", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "accent", boardView: "A18", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "desactive", boardView: "R7", backdrop: .dark),
            MeeshyKitCatalogState(id: "emplacements", boardView: "A16", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "groupe", boardView: "R11", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "teinte", backdrop: .media, isTouchable: true),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK06(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyToggleRowSample(stateID: state.id)
    }
}

/// L'échantillon d'un état : une ligne (ou un groupe de lignes) posée sur le fond
/// de la planche. Les textes sont ceux de la planche, non traduits : un échantillon
/// de catalogue n'est pas une vue de l'app.
private struct MeeshyToggleRowSample: View {
    let stateID: String

    var body: some View {
        VStack(spacing: 0) {
            rows
        }
        .padding(MeeshySpacing.sm)
    }

    @ViewBuilder
    private var rows: some View {
        switch stateID {
        case "action":
            MeeshyToggleRow("Partager hors de Meeshy", systemImage: "square.and.arrow.up", action: {})
        case "sous-titre":
            MeeshyToggleRow("Tendances", subtitle: "Monde", accessory: .chevron, action: {})
        case "sans-icone":
            MeeshyToggleRow("Visible du début à la fin", accessory: .toggle(isOn: false), action: {})
        case "bascule-ouverte":
            MeeshyToggleRow("Reprise du son", subtitle: "Son original", accessory: .toggle(isOn: true), action: {})
        case "bascule-fermee":
            MeeshyToggleRow("Muet", systemImage: "speaker.slash", accessory: .toggle(isOn: false), action: {})
        case "coche":
            MeeshyToggleRow("Plage de Ngor", systemImage: "mappin", accessory: .check(isSelected: true), action: {})
        case "case":
            MeeshyToggleRow("Story", accessory: .checkbox(isChecked: true), action: {})
        case "chevron":
            MeeshyToggleRow("Langue du son", accessory: .chevron, action: {})
        case "valeur":
            MeeshyToggleRow("Langue du son", accessory: .value("Wolof"), action: {})
        case "destructif":
            MeeshyToggleRow("Tout effacer", kind: .destructive, action: {})
        case "accent":
            MeeshyToggleRow("Autour de moi", systemImage: "location", kind: .accent, action: {})
        case "desactive":
            MeeshyToggleRow("Mood", subtitle: "Disponible en Proche", accessory: .toggle(isOn: false), action: {})
                .disabled(true)
        case "emplacements":
            MeeshyToggleRow("Amis", action: {})
        case "groupe":
            VStack(spacing: 0) {
                MeeshyToggleRow("Partager", systemImage: "square.and.arrow.up", action: {})
                MeeshyToggleRow("Copier le lien", systemImage: "link", showsDivider: true, action: {})
                MeeshyToggleRow("Tout effacer", kind: .destructive, showsDivider: true, action: {})
            }
        case "teinte":
            MeeshyToggleRow("Mention", accessory: .toggle(isOn: true), tint: MeeshyColors.brandPrimary, action: {})
        default:
            MeeshyToggleRow("Thème", accessory: .toggle(isOn: true), tone: .theme, action: {})
        }
    }
}
#endif
