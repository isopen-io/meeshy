#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK09 = MeeshyKitCatalogEntry(
        key: "K09",
        name: "MeeshyProgressRing",
        states: [
            MeeshyKitCatalogState(id: "publication", boardView: "P1", backdrop: .dark),
            MeeshyKitCatalogState(id: "vignette", boardView: "A7", backdrop: .media),
            MeeshyKitCatalogState(id: "declencheur", boardView: "A9", backdrop: .media),
            MeeshyKitCatalogState(id: "indetermine", backdrop: .dark),
            MeeshyKitCatalogState(id: "fige", backdrop: .dark),
            MeeshyKitCatalogState(id: "ligne", backdrop: .light),
            MeeshyKitCatalogState(id: "theme", backdrop: .light),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK09(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyProgressRingSample(stateID: state.id)
    }
}

/// L'échantillon d'un état, aux mesures de la planche : P1 (diamètre 40 dans une
/// capsule de 48, 62 %), A7 (22, « 60 », sur un disque d'ombre), A9 (102, rouge,
/// carré d'arrêt en `center`), et les états sans vue (indéterminé, figé, ligne,
/// thème).
private struct MeeshyProgressRingSample: View {
    let stateID: String

    var body: some View {
        switch stateID {
        case "publication":
            MeeshyProgressRing(progress: 0.62, label: "Publication", diameter: 40)
        case "vignette":
            MeeshyProgressRing(progress: 0.60, label: "Envoi", diameter: 22, scrim: true)
        case "declencheur":
            MeeshyProgressRing(progress: 0.45, label: "Enregistrement", diameter: 102,
                               tint: .solid(MeeshyColors.error), sweeps: true) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(MeeshyColors.error)
                    .frame(width: 30, height: 30)
            }
        case "indetermine":
            MeeshyProgressRing(progress: nil, label: "Préparation", diameter: 44)
        case "fige":
            MeeshyProgressRing(progress: 0.5, label: "Export", diameter: 44, sweeps: true)
        case "ligne":
            MeeshyProgressRing(progress: 0.3, label: nil, diameter: 14)
        default:
            MeeshyProgressRing(progress: 0.7, label: "Accent", diameter: 44, tone: .theme)
        }
    }
}
#endif
