#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK14 = MeeshyKitCatalogEntry(
        key: "K14",
        name: "MeeshyStatusCapsule",
        states: [
            MeeshyKitCatalogState(id: "plafond", boardView: "R10", backdrop: .media),
            MeeshyKitCatalogState(id: "hors-ligne", boardView: "P2", backdrop: .media),
            MeeshyKitCatalogState(id: "echec", boardView: "P3", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "clair", backdrop: .light),
            MeeshyKitCatalogState(id: "theme", backdrop: .light),
            MeeshyKitCatalogState(id: "teinte", backdrop: .media),
            MeeshyKitCatalogState(id: "fermable", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK14(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyStatusCapsuleSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : la FACE, aux mots des vues de la planche (R10 sur
/// deux lignes à 350, P2 avec son Wi-Fi barré, P3 avec son détail et
/// « Réessayer »). Le catalogue montre la face : elle ne vibre pas, ne
/// s'annonce pas et ne se retire pas seule.
private struct MeeshyStatusCapsuleSample: View {
    let stateID: String
    let isPressed: Bool

    var body: some View {
        switch stateID {
        case "plafond":
            MeeshyStatusCapsule("Dix scènes au maximum — supprimez-en une pour en créer une autre", kind: .warning)
        case "hors-ligne":
            MeeshyStatusCapsule("Story enregistrée — publiée au retour en ligne", systemImage: "wifi.slash")
        case "echec":
            MeeshyStatusCapsule(
                "Non publié : le réel",
                detail: "Gardé en brouillon",
                kind: .failure,
                action: MeeshyStatusCapsuleAction(label: "Réessayer", systemImage: "arrow.clockwise") {},
                isPressed: isPressed ? true : nil
            )
        case "clair":
            MeeshyStatusCapsule("Dix scènes au maximum", detail: "Supprimez-en une pour en créer une autre",
                                kind: .warning, tone: .onLight)
        case "theme":
            MeeshyStatusCapsule("Un seul compte par appareil", kind: .info, tone: .theme)
        case "teinte":
            MeeshyStatusCapsule("La caméra de Camille est coupée", systemImage: "video.slash",
                                kind: .warning, tint: MeeshyColors.error)
        default:
            MeeshyStatusCapsule("Brouillon enregistré", kind: .success, closeLabel: "Fermer", onDismiss: {})
        }
    }
}
#endif
