import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - DataChannel Control Messages

/// Message de CONTRÔLE in-band sur le data channel — enveloppe minimale
/// `{type, reason?}`. Le type `"bye"` signale le raccroché du pair en P2P
/// direct : zéro aller-retour serveur, l'autre bout coupe instantanément
/// (parité WhatsApp). Le fanout socket `call:ended` reste le chemin
/// AUTORITATIF (et le seul qui atteint un pair dont le média est déjà mort) ;
/// le bye n'est qu'un raccourci — les deux chemins sont dédupliqués par le
/// garde `.ended` de `handleRemoteEnd`.
nonisolated struct DataChannelControlMessage: Codable, Sendable, Equatable {
    let type: String
    let reason: String?
}
