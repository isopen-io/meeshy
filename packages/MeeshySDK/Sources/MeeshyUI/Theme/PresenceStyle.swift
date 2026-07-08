import SwiftUI
import MeeshySDK

// MARK: - Presence Style (mapping couleur CENTRAL)

/// Mapping unique etat de presence -> couleur, partage par TOUTES les surfaces
/// (MeeshyAvatar, UserIdentityBar, profils, stories, listes). Regle produit
/// identique web (`PRESENCE_DOT_CLASS`) et Android (`meeshyPresenceDotColor`) :
///   online / recent -> vert  MeeshyColors.success  (#34D399), pulse sur online
///   away            -> orange MeeshyColors.warning (#FBBF24)
///   offline         -> gris  #9CA3AF
/// Ne JAMAIS redeclarer ces couleurs localement dans une vue.
public extension PresenceState {
    /// Couleur du dot de presence.
    var dotColor: Color {
        switch self {
        case .online, .recent: return MeeshyColors.success
        case .away: return MeeshyColors.warning
        case .offline: return MeeshyColors.neutral400
        }
    }

    /// Seul `.online` (connecte ou actif <= 60s) pulse.
    var pulses: Bool { self == .online }

    /// Libelle localise du statut.
    var localizedLabel: String {
        switch self {
        case .online:
            return String(localized: "presence.online", defaultValue: "En ligne", bundle: .module)
        case .recent:
            return String(localized: "presence.recent", defaultValue: "Actif récemment", bundle: .module)
        case .away:
            return String(localized: "presence.away", defaultValue: "Absent", bundle: .module)
        case .offline:
            return String(localized: "presence.offline", defaultValue: "Hors ligne", bundle: .module)
        }
    }
}
