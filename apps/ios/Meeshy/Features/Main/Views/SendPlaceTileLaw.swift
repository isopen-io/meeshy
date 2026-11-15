import Foundation
import MeeshySDK

/// Sort de la tuile de lieu du composer après un envoi (#4948, D-SEND-02).
///
/// Le retrait de la tuile était câblé sur le RÉSULTAT réseau — pour la garder
/// en cas d'échec, au prix du cas nominal : un lieu envoyé seul restait dans
/// le composer jusqu'à l'ACK (12 s de délai REST au pire), et le tap semblait
/// n'avoir rien fait. La règle suit désormais le motif de tout envoi
/// optimiste : snapshot → retrait immédiat (avec le vidage du texte) →
/// restauration seulement si l'envoi échoue.
nonisolated enum SendPlaceTileLaw {

    enum Outcome: Equatable {
        case cleared
        case restored
    }

    /// `true` = ACK reçu OU mise en file durable : le lieu est parti.
    static func outcome(sent: Bool) -> Outcome {
        sent ? .cleared : .restored
    }

    /// Ce que le composer doit reprendre après l'envoi, `nil` = rien à
    /// remettre. Un lieu choisi PENDANT l'aller-retour réseau (`current`)
    /// est plus récent que le snapshot : un échec ne l'écrase jamais.
    static func restoration(of snapshot: SharedPlace?, sent: Bool, current: SharedPlace?) -> SharedPlace? {
        guard outcome(sent: sent) == .restored, current == nil else { return nil }
        return snapshot
    }
}
