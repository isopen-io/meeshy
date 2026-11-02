import AVFoundation
import CoreMedia
import MeeshySDK

/// Correction de dérive d'une vidéo de scène pendant la lecture (#9702).
///
/// Le calage sur la timeline n'avait lieu qu'au démarrage et à la reprise :
/// une vidéo qui prenait du retard en cours de route (stall réseau d'une vidéo
/// non primaire, décodage en retard) ne revenait jamais sur l'audio. Le canvas
/// la mesure maintenant toutes les ~0,5 s, et ne la recale qu'au-delà du seuil
/// — en deçà, un seek coûterait plus (hoquet) qu'il ne rattraperait.
nonisolated enum VideoDriftCorrection {

    /// Tolérance d'un recalage EN LECTURE : de part et d'autre de la cible,
    /// pour qu'AVFoundation atterrisse sur une image proche sans décoder
    /// depuis l'image-clé à l'image près. Un seek précis qui décode plus de
    /// 0,5 s serait annulé par le contrôle suivant — une rafale de recalages.
    /// Elle reste sous la moitié du seuil : le point d'arrivée ne redéclenche
    /// jamais un recalage.
    static let seekTolerance = CMTime(seconds: 0.1, preferredTimescale: 600)

    /// Recale `player` sur `target` si aucun recalage n'est déjà en vol (#9884) :
    /// sur une vidéo distante à GOP long, un seek peut durer plus que l'intervalle
    /// de contrôle, et les recalages s'empilaient. La complétion libère le portail.
    static func recenter(_ player: AVPlayer, to target: CMTime, gate: DriftSeekGate) {
        guard gate.claim() else { return }
        player.seek(to: target, toleranceBefore: seekTolerance, toleranceAfter: seekTolerance) { _ in
            gate.release()
        }
    }

    /// Cible du recalage, ou `nil` si la vidéo est assez proche de la timeline.
    static func driftCorrection(expected: Double, actual: Double, threshold: Double) -> CMTime? {
        guard expected.isFinite, actual.isFinite, threshold.isFinite else { return nil }
        guard abs(actual - expected) > threshold else { return nil }
        return CMTime(seconds: max(0, expected), preferredTimescale: 600)
    }
}

/// **Un recalage de dérive à la fois, par lecteur** (#9884). Une copie partage
/// le même vol : la complétion d'un seek relâche le portail que la couche consulte.
nonisolated struct DriftSeekGate: Sendable {
    private let inFlight = Locked(false)

    init() {}

    /// `true` : la place était libre, et elle est prise jusqu'à `release()`.
    func claim() -> Bool {
        inFlight.mutate { pris in
            guard !pris else { return false }
            pris = true
            return true
        }
    }

    func release() {
        inFlight.mutate { pris in pris = false }
    }
}
