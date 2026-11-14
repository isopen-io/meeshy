#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK24 = MeeshyKitCatalogEntry(
        key: "K24",
        name: "MeeshyContextLines",
        states: [
            MeeshyKitCatalogState(id: "son", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "references", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "puce", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "puce-claire", boardView: "R13", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", backdrop: .light),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK24(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyContextLinesSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état K24 : contenu de démonstration fixe, posé sur le fond
/// de l'état. Aucun type du composer, aucun appel réseau.
private struct MeeshyContextLinesSample: View {
    let stateID: String
    let isPressed: Bool

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            switch stateID {
            case "son":
                MeeshyContextSoundLine(
                    label: "Son de fond, Afro Sunset, Awa, 15 secondes",
                    title: "Afro Sunset · Awa",
                    levels: [0.2, 0.7, 0.4, 0.9, 0.5, 0.3, 0.8, 0.6],
                    detail: "0:15",
                    action: {}
                )
            case "references":
                MeeshyContextReferenceLine(
                    label: "Références",
                    references: [
                        MeeshyContextReference(id: "h1", text: "#dakar", spokenLabel: "Hashtag dakar"),
                        MeeshyContextReference(id: "h2", text: "#plage", spokenLabel: "Hashtag plage"),
                        MeeshyContextReference(id: "a1", text: "Avec @karim", spokenLabel: "Avec karim", action: {}),
                    ]
                )
            case "puce-claire", "puce":
                MeeshyContextChip(
                    label: "Audience",
                    title: "Amis",
                    systemImage: "person.2.fill",
                    tone: stateID == "puce-claire" ? .onLight : .deep,
                    isPressed: isPressed ? true : nil,
                    action: {}
                )
            default:
                MeeshyContextChip(label: "Audience", title: "Amis", systemImage: "person.2.fill", tone: .theme)
            }
        }
        .padding(MeeshySpacing.md)
    }
}
#endif
