#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK05 = MeeshyKitCatalogEntry(
        key: "K05",
        name: "MeeshyLabeledSlider",
        states: [
            MeeshyKitCatalogState(id: "valeur", boardView: "A2", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "sans-valeur", boardView: "O5", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "borne-basse", boardView: "O5", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "neutre", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "teinte", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", boardView: "O5", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "desactive", backdrop: .media),
            MeeshyKitCatalogState(id: "piste-seule", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "grille", boardView: "O5", backdrop: .media, isTouchable: true),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK05(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyLabeledSliderSample(stateID: state.id)
    }
}

/// Le curseur du catalogue : une valeur de départ et des bornes propres à chaque état.
private struct MeeshyLabeledSliderSample: View {
    let stateID: String
    @State private var value: Double

    init(stateID: String) {
        self.stateID = stateID
        _value = State(initialValue: Self.initialValue(for: stateID))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyLabeledSlider(
                "Taille",
                value: $value,
                in: 0...100,
                valueText: "\(Int(value.rounded())) %",
                showsValue: stateID != "sans-valeur" && stateID != "grille",
                neutral: stateID == "neutre" ? 50 : nil,
                resetLabel: stateID == "neutre" ? "Réinitialiser" : nil,
                tint: stateID == "teinte" ? MeeshyColors.brandPrimary : nil
            )
            .disabled(stateID == "desactive")
            if stateID == "piste-seule" {
                MeeshySliderTrack("Taille", value: $value, in: 0...100, valueText: "\(Int(value.rounded())) %")
            }
        }
        .padding(MeeshySpacing.md)
        .frame(maxWidth: 320)
        .meeshyGlassTone(stateID == "theme" ? .theme : .deep)
    }

    private static func initialValue(for stateID: String) -> Double {
        switch stateID {
        case "borne-basse": return 0
        case "neutre": return 50
        default: return 70
        }
    }
}
#endif
