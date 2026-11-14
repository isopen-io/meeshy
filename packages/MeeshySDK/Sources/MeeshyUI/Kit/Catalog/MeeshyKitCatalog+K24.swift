#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK24 = MeeshyKitCatalogEntry(
        key: "K24",
        name: "MeeshyContextLines",
        states: [
            MeeshyKitCatalogState(id: "son", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "son-vocal", backdrop: .media),
            MeeshyKitCatalogState(id: "references", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "references-lieu", boardView: "A18", backdrop: .media),
            MeeshyKitCatalogState(id: "references-debord", backdrop: .media),
            MeeshyKitCatalogState(id: "puce", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "puce-claire", boardView: "R13", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "puce-hors-scene", boardView: "I4", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "puce-chrono", boardView: "A9", backdrop: .media),
            MeeshyKitCatalogState(id: "puce-disque", backdrop: .media, isTouchable: true),
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

    private static let levels: [Float] = [0.2, 0.7, 0.4, 0.9, 0.5, 0.3, 0.8, 0.6, 0.45, 0.75]

    var body: some View {
        switch stateID {
        case "son", "son-vocal": soundSample
        case "references", "references-lieu", "references-debord": referenceSample
        case "theme": themeSample
        default: chipSample
        }
    }

    @ViewBuilder
    private var soundSample: some View {
        if stateID == "son-vocal" {
            MeeshyContextSoundLine(label: "Message vocal, 12 secondes", levels: Self.levels, detail: "0:12")
        } else {
            MeeshyContextSoundLine(
                label: "Son de fond, Afro Sunset, Awa, 15 secondes",
                title: "Afro Sunset · Awa",
                levels: Self.levels,
                detail: "0:15",
                action: {}
            )
            .opacity(isPressed ? MeeshyContextLinesRecipe.pressedOpacity : 1)
        }
    }

    @ViewBuilder
    private var referenceSample: some View {
        switch stateID {
        case "references-lieu":
            MeeshyContextReferenceLine(label: "Références", references: [
                MeeshyContextReference(id: "l", text: "Plage de Ngor", spokenLabel: "Lieu : Plage de Ngor", systemImage: "mappin"),
                MeeshyContextReference(id: "h", text: "#dakar", spokenLabel: "Hashtags : dakar"),
            ])
        case "references-debord":
            MeeshyContextReferenceLine(label: "Références", references: Self.references + [
                MeeshyContextReference(id: "h3", text: "#ngor #soleil #vacances", spokenLabel: "Hashtags : ngor, soleil, vacances"),
            ])
            .frame(width: 240)
        default:
            MeeshyContextReferenceLine(label: "Références", references: Self.references)
                .opacity(isPressed ? MeeshyContextLinesRecipe.pressedOpacity : 1)
        }
    }

    private static let references = [
        MeeshyContextReference(id: "h", text: "#dakar", spokenLabel: "Hashtags : dakar", action: {}),
        MeeshyContextReference(id: "a", text: "Avec @karim", spokenLabel: "Avec karim", action: {}),
    ]

    @ViewBuilder
    private var chipSample: some View {
        switch stateID {
        case "puce-chrono":
            MeeshyContextChip(label: "Durée de la capture", title: "", detail: "0:04", tone: .deep, updatesFrequently: true, leading: {
                Circle().fill(MeeshyColors.errorStrong).frame(width: MeeshyIconSize.xxs, height: MeeshyIconSize.xxs)
            })
        case "puce-disque":
            MeeshyContextChip(label: "Audience", title: "Amis proches et famille", systemImage: "person.2.fill",
                              tone: .deep, isPressed: pressed, action: {})
                .frame(width: MeeshyControlSize.tapTarget)
        default:
            MeeshyContextChip(label: "Audience", title: "Amis", systemImage: "person.2.fill",
                              tone: tone, isPressed: pressed, action: {})
        }
    }

    private var pressed: Bool? { isPressed ? true : nil }

    private var tone: MeeshyGlassTone {
        switch stateID {
        case "puce-claire": return .onLight
        case "puce-hors-scene": return .plain
        default: return .deep
        }
    }

    private var themeSample: some View {
        VStack(spacing: MeeshySpacing.sm) {
            MeeshyContextSoundLine(label: "Son de fond, Afro Sunset, Awa", title: "Afro Sunset · Awa",
                                   levels: [], surface: .theme, action: {})
            MeeshyContextChip(label: "Audience", title: "Amis", systemImage: "person.2.fill", tone: .theme, action: {})
            MeeshyContextReferenceLine(label: "Références", references: Self.references, surface: .theme)
        }
    }
}
#endif
