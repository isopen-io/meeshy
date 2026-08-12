import SwiftUI
import MeeshySDK

// MARK: - Presence Style (mapping couleur CENTRAL)

/// Mapping unique etat de presence -> couleur, partage par TOUTES les surfaces
/// (MeeshyAvatar, UserIdentityBar, profils, stories, listes). Regle produit
/// 1/3/5 identique web (`PRESENCE_DOT_CLASS`) et Android (`meeshyPresenceDotColor`) :
///   online  -> vert   MeeshyColors.success    (#34D399), pulse
///   away    -> orange MeeshyColors.warning    (#FBBF24)
///   idle    -> gris   MeeshyColors.neutral400 (#9CA3AF), AFFICHE sur les dots
///   offline -> AUCUN indicateur (`showsIndicator == false`) ; le gris + le
///              libelle « Hors ligne » ne servent qu'aux contextes labellises.
/// Ne JAMAIS redeclarer ces couleurs localement dans une vue.
public extension PresenceState {
    /// Couleur du dot de presence.
    var dotColor: Color {
        switch self {
        case .online: return MeeshyColors.success
        case .away: return MeeshyColors.warning
        case .idle, .offline: return MeeshyColors.neutral400
        }
    }

    /// Seul `.online` (connecte ou actif <= 60s) pulse.
    var pulses: Bool { self == .online }

    /// `offline` ne rend RIEN (ni dot, ni badge, ni annonce VoiceOver) — les
    /// points de rendu gatent sur cette propriete plutot que de redeclarer
    /// la regle localement.
    var showsIndicator: Bool { self != .offline }

    /// Libelle localise du statut.
    var localizedLabel: String {
        switch self {
        case .online:
            return String(localized: "presence.online", defaultValue: "En ligne", bundle: .module)
        case .away:
            return String(localized: "presence.away", defaultValue: "Absent", bundle: .module)
        case .idle:
            return String(localized: "presence.idle", defaultValue: "Inactif", bundle: .module)
        case .offline:
            return String(localized: "presence.offline", defaultValue: "Hors ligne", bundle: .module)
        }
    }
}
