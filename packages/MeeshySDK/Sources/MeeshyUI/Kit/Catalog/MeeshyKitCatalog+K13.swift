#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK13 = MeeshyKitCatalogEntry(
        key: "K13",
        name: "MeeshySplitActionButton",
        states: [
            MeeshyKitCatalogState(id: "repos", boardView: "R2", isTouchable: true),
            MeeshyKitCatalogState(id: "chevron", boardView: "R3", isTouchable: true),
            MeeshyKitCatalogState(id: "sans-chevron", boardView: "P6"),
            MeeshyKitCatalogState(id: "en-cours", boardView: "P1"),
            MeeshyKitCatalogState(id: "indetermine", boardView: "P1"),
            MeeshyKitCatalogState(id: "differe", boardView: "P2"),
            MeeshyKitCatalogState(id: "retenu"),
            MeeshyKitCatalogState(id: "largeur-imposee", boardView: "I4"),
            MeeshyKitCatalogState(id: "scene-claire", boardView: "R13", backdrop: .light),
            MeeshyKitCatalogState(id: "compact"),
            MeeshyKitCatalogState(id: "replie"),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK13(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshySplitActionButtonSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : le bouton aux mots des vues de la planche. Les
/// libellés sont ceux d'un hôte (déjà traduits), le catalogue ne les devine pas.
private struct MeeshySplitActionButtonSample: View {
    let stateID: String
    let isPressed: Bool

    private let choose = MeeshySplitActionChoose(label: "Choisir ce qui part")

    var body: some View {
        sample.environment(\.meeshySplitActionForcedPress, forcedSegment)
    }

    private var forcedSegment: MeeshySplitActionSegment? {
        guard isPressed else { return nil }
        return stateID == "chevron" ? .chevron : .label
    }

    @ViewBuilder
    private var sample: some View {
        switch stateID {
        case "sans-chevron":
            MeeshySplitActionButton("Enregistrer") {}
        case "en-cours":
            MeeshySplitActionButton("Publier la story", phase: .busy(progress: 0.62, title: "Publication…"),
                                    choose: choose) {}
        case "indetermine":
            MeeshySplitActionButton("Publier la story", phase: .busy(progress: nil, title: "Publication…"),
                                    choose: choose) {}
        case "differe":
            MeeshySplitActionButton(
                "Publier la story", phase: .deferred(title: "Au retour en ligne"), choose: choose, action: {},
                statusGlyph: { Image(systemName: "wifi.slash") }, fallbackGlyph: { MeeshySplitActionArrowGlyph() }
            )
        case "retenu":
            MeeshySplitActionButton("Publier la story", isEnabled: false, choose: choose) {}
        case "largeur-imposee":
            MeeshySplitActionButton("Publier la story", width: .fill, choose: choose) {}
                .frame(width: 340)
        case "compact":
            MeeshySplitActionButton("Publier", size: .compact, choose: choose) {}
        case "replie":
            MeeshySplitActionButton("Publicar historia, publicación y reel", shortTitle: "Publicar", maxLines: 2,
                                    choose: choose) {}
                .frame(width: 200)
        default:
            MeeshySplitActionButton("Publier la story", choose: choose) {}
        }
    }
}
#endif
