#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK09 = MeeshyKitCatalogEntry(
        key: "K09",
        name: "MeeshyProgressRing",
        states: [
            MeeshyKitCatalogState(id: "publication", boardView: "P1", backdrop: .media),
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

/// L'échantillon d'un état, aux mesures de la planche : P1 (diamètre 40 sur le
/// fond de marque, 62 %), A7 (22, « 60 », sur un disque d'ombre), A9 (102,
/// arc rouge qui avance, carré d'arrêt en `center`, aucun balayage : la loi 13
/// n'en pose pas sur un arc qui avance), et les états sans vue (indéterminé,
/// figé avec balayage, ligne sous 22 dans une bulle, ton `theme` en dégradé).
private struct MeeshyProgressRingSample: View {
    let stateID: String

    var body: some View {
        switch stateID {
        case "publication":
            MeeshyProgressRing(progress: 0.62, label: "Publication", diameter: MeeshyControlSize.large)
        case "vignette":
            MeeshyProgressRing(progress: 0.60, label: "Envoi", diameter: MeeshyIconSize.xxl, scrim: true)
        case "declencheur":
            MeeshyProgressRing(progress: 0.45, label: "Enregistrement", diameter: 102,
                               tint: .solid(MeeshyColors.error)) {
                RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous)
                    .fill(MeeshyColors.error)
                    .frame(width: MeeshyIconSize.xxxl, height: MeeshyIconSize.xxxl)
            }
        case "indetermine":
            MeeshyProgressRing(progress: nil, label: "Ajout", valueText: "Préparation…")
        case "fige":
            MeeshyProgressRing(progress: 0.9, label: "Export", sweeps: true)
        case "ligne":
            MeeshyProgressRing(progress: 0.3, label: nil, diameter: MeeshyIconSize.sm, tone: .theme)
        default:
            MeeshyProgressRing(progress: 0.7, label: "Envoi",
                               tint: .gradient([MeeshyColors.indigo400, MeeshyColors.indigo700]), tone: .theme)
        }
    }
}
#endif
