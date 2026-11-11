#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK07 = MeeshyKitCatalogEntry(
        key: "K07",
        name: "MeeshyColorDots",
        states: [
            MeeshyKitCatalogState(id: "texte", boardView: "A3", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "dessin", boardView: "A13", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "fond", boardView: "S1", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "sans-courante", backdrop: .media),
            MeeshyKitCatalogState(id: "degrade", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "desactive", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK07(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyColorDotsSample(stateID: state.id)
    }
}

/// Échantillon des états K07 : une palette de démonstration faite de jetons
/// sémantiques, la courante gardée par l'état.
private struct MeeshyColorDotsSample: View {
    let stateID: String

    @State private var selection: String?

    var body: some View {
        MeeshyColorDots(
            stateID == "degrade" ? gradientDots : sampleDots,
            selection: stateID == "sans-courante" ? nil : (selection ?? "primary"),
            label: "Couleur du texte",
            size: stateID == "fond" ? .s32 : .s28,
            layout: stateID == "dessin" ? .row : .wrap,
            tone: stateID == "theme" ? .theme : nil,
            onSelect: { selection = $0 }
        )
        .disabled(stateID == "desactive")
        .padding(MeeshySpacing.md)
    }

    private var sampleDots: [MeeshyColorDot] {
        [
            MeeshyColorDot(id: "primary", fill: .solid(MeeshyColors.brandPrimary), name: "Bleu"),
            MeeshyColorDot(id: "accent", fill: .solid(MeeshyColors.tileRose), name: "Rose"),
            MeeshyColorDot(id: "neutral", fill: .solid(MeeshyColors.onMedia), name: "Blanc"),
        ]
    }

    private var gradientDots: [MeeshyColorDot] {
        [
            MeeshyColorDot(id: "degrade", fill: .gradient([MeeshyColors.brandPrimary, MeeshyColors.tileRose]), name: "Dégradé"),
            MeeshyColorDot(id: "none", fill: .hollow, name: "Aucun"),
        ]
    }
}
#endif
