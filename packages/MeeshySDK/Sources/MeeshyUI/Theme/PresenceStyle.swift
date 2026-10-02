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

    /// Le contour de l'emoji de mood (#9065) : le mood remplace le point, et
    /// porte sa couleur quand elle dit « ici » (indigo) ou « en ligne » (vert).
    public var moodOutline: Color? {
        switch self {
        case .here: return color
        case .presence(.online): return color
        case .presence: return nil
        }
    }

    /// La respiration d'échelle des pastilles de présence. « ici » a la sienne,
    /// son onde (`PresenceHereWave`, #9065).
    public var pulses: Bool {
        switch self {
        case .here: return false
        case .presence(let state): return state.pulses
        }
    }

    /// Le diamètre du point, en fraction de l'avatar : la pastille de présence
    /// à 0,26, le point « ici » au double (#9061). Jumeau de `HERE_DOT_RATIO`
    /// (`apps/web/src/components/avatar.tsx`).
    public func diameter(avatarSize: CGFloat, hereRatio: CGFloat = AvatarPresenceDot.hereRatio) -> CGFloat {
        switch self {
        case .here: return avatarSize * hereRatio
        case .presence: return avatarSize * 0.26
        }
    }

    public static let hereRatio: CGFloat = 0.52

    /// Le décalage qui pose le CENTRE du point sur le cercle de l'avatar, à
    /// 45°, depuis l'alignement `.bottomTrailing` de son cadre (#9061). Le
    /// cadre vaut l'avatar seul, ou l'anneau de story quand il est peint.
    /// Sans ce calcul, un point aligné au coin du cadre tombe hors du cercle.
    public static func centerOffset(avatarSize: CGFloat, frameSize: CGFloat, dotDiameter: CGFloat) -> CGSize {
        let target = frameSize / 2 + avatarSize / 2 * cos(.pi / 4)
        let delta = target - (frameSize - dotDiameter / 2)
        return CGSize(width: delta, height: delta)
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

/// L'onde du point « ici » (#9065), une échelle partagée avec le mood :
/// IMPERCEPTIBLE quand le pair regarde en plein écran — il s'y stabilise —,
/// DOUCE au repos — il observe —, à peine plus ample quand il défile,
/// écoute ou agit. Seule l'arrivée pulse franchement (`PresenceArrival`).
/// Jumelle de `presence-dot-hush` / `-rest` / `-pulse`
/// (`apps/web/src/styles/avatar.css`).
public struct PresenceHereWave: Equatable, Sendable {
    public let peakScale: CGFloat
    public let startOpacity: Double
    public let duration: Double

    public static let hush = PresenceHereWave(peakScale: 1.25, startOpacity: 0.2, duration: 2.8)
    public static let rest = PresenceHereWave(peakScale: 1.6, startOpacity: 0.3, duration: 2.4)
    public static let vivid = PresenceHereWave(peakScale: 1.9, startOpacity: 0.4, duration: 1.8)

    public static func `for`(_ here: ConversationHere) -> PresenceHereWave? {
        switch here {
        case .absent: return nil
        case .here: return .rest
        case .active: return .vivid
        case .focused: return .hush
        }
    }
}

/// L'arrivée « ici » (#9047, #9065) : le point — ou le mood — grossit en
/// ressort, et un GROS pulse part de lui avant qu'il se stabilise. Jumelle de
/// `presence-dot-ripple` (`apps/web/src/styles/avatar.css`).
public enum PresenceArrival {
    public static let peakScale: CGFloat = 3
    public static let lineWidth: CGFloat = 3
    public static let startOpacity: Double = 0.9
    public static let duration: Double = 0.9
}
