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

// MARK: - « Est dans la conversation » (#8892)

/// Couleur du point d'un pair qui a l'écran de la conversation OUVERT.
/// Miroir iOS de `PRESENCE_HERE_HEX` (`packages/shared/utils/user-presence.ts`),
/// gardé par `presence-color-mirror-parity.test.ts`. Ne JAMAIS la redéclarer
/// localement dans une vue.
public enum PresenceStyle {
    public static let hereDotColor = MeeshyColors.brandPrimary
}

/// Ce que le point d'un avatar rend dans un contexte de conversation — jumeau
/// de `presenceDotHex(status, { here })` côté TS.
///
/// Être ICI prime sur la présence globale et se rend même quand celle-ci est
/// masquée (`nil` / `.offline`) : c'est un signal d'ACTIVITÉ servi par la room,
/// comme la frappe. `nil` = aucun point.
public enum AvatarPresenceDot: Equatable, Sendable {
    case presence(PresenceState)
    case here

    public static func resolve(presence: PresenceState?, isHere: Bool) -> AvatarPresenceDot? {
        if isHere { return .here }
        guard let presence, presence.showsIndicator else { return nil }
        return .presence(presence)
    }

    public var color: Color {
        switch self {
        case .here: return PresenceStyle.hereDotColor
        case .presence(let state): return state.dotColor
        }
    }

    /// L'identité du point pour ses transitions (#9047) : quand elle change, le
    /// point sortant diminue et le point entrant apparaît en rebondissant.
    public var transitionKey: String {
        switch self {
        case .here: return "here"
        case .presence(let state): return "presence.\(state.rawValue)"
        }
    }

    /// Le point indigo « ici » pulse en arrivant (#9047) — une onde qui part
    /// de lui et s'éteint ; les autres points ne font que rebondir.
    public var arrivesWithRipple: Bool {
        self == .here
    }

    /// Être dans la conversation est une activité en cours : il pulse comme `online`.
    public var pulses: Bool {
        switch self {
        case .here: return true
        case .presence(let state): return state.pulses
        }
    }

    public var localizedLabel: String {
        switch self {
        case .here:
            return String(localized: "presence.here", defaultValue: "Dans la conversation", bundle: .module)
        case .presence(let state):
            return state.localizedLabel
        }
    }
}

// MARK: - Libelle « vu il y a … » (localise)

public extension MeeshyConversation {
    /// Libelle humain de la derniere activite du pair, LOCALISE.
    ///
    /// Vit ici et non sur le modele : la cible `MeeshySDK` n'embarque aucun
    /// catalogue de chaines, si bien que son predecesseur (`lastSeenText`)
    /// servait du francais code en dur — « En ligne », « Vu il y a 3min » — a
    /// tous les utilisateurs, y compris les six autres langues de l'app.
    ///
    /// `nil` quand la conversation ne porte aucun `lastSeenAt` : l'absence de
    /// donnee ne se rend pas, elle ne s'affiche pas.
    var lastSeenLabel: String? {
        guard let lastSeenAt else { return nil }
        let elapsed = Date().timeIntervalSince(lastSeenAt)
        if elapsed < 60 {
            return PresenceState.online.localizedLabel
        }
        if elapsed < 3600 {
            return String(
                localized: "presence.lastSeen.minutes",
                defaultValue: "Vu il y a \(Int(elapsed / 60))min",
                bundle: .module
            )
        }
        if elapsed < 86400 {
            return String(
                localized: "presence.lastSeen.hours",
                defaultValue: "Vu il y a \(Int(elapsed / 3600))h",
                bundle: .module
            )
        }
        return String(
            localized: "presence.lastSeen.days",
            defaultValue: "Vu il y a \(Int(elapsed / 86400))j",
            bundle: .module
        )
    }
}
