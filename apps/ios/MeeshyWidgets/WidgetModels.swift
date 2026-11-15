import Foundation

// MARK: - Data Models
struct Conversation: Codable, Identifiable {
    let id: String
    let contactName: String
    let contactAvatar: String
    let lastMessage: String
    let timestamp: Date
    let isUnread: Bool
    let isPinned: Bool
    let accentColor: String
}

/// Miroir cible-widget de `PresenceState` (SDK) — l'extension ne lie pas
/// `MeeshySDK`, elle en reproduit donc les symboles, comme `FavoriteContact`
/// reproduit `WidgetFavoriteContact`.
///
/// Les valeurs brutes DOIVENT rester identiques à celles du SDK : c'est le
/// contrat de transport de l'App Group. Garde : `WidgetPresenceContractTests`.
enum WidgetPresence: String {
    case online, away, idle, offline

    /// Règle produit 1/3/5 (`CLAUDE.md` § User Presence, mapping central
    /// `PresenceState.dotColor`) : vert, orange, gris — et RIEN hors ligne.
    /// Les hex sont ceux de `MeeshyColors`, que la cible widget ne peut pas
    /// lier ; `WidgetPresenceContractTests` les confronte à la source.
    var dotHex: String? {
        switch self {
        case .online: return WidgetColors.successHex
        case .away: return WidgetColors.warningHex
        case .idle: return WidgetColors.neutral400Hex
        // Hors ligne ne rend AUCUNE pastille (comportement WhatsApp) — le gris
        // des maps centrales est réservé aux affichages LABELLISÉS, que le
        // widget Favoris n'a pas.
        case .offline: return nil
        }
    }

    /// Libellé VoiceOver de l'état.
    ///
    /// `offline` en a un alors qu'il ne rend aucune pastille, et ce n'est pas
    /// une incohérence : une annonce EST un affichage labellisé, le cas que la
    /// règle produit réserve justement au gris et au mot. Un lecteur d'écran
    /// qui n'entend rien ne peut pas distinguer « hors ligne » de « présence
    /// inconnue ».
    var localizedLabel: String {
        switch self {
        case .online: return String(localized: "widget.presence.online", defaultValue: "Online")
        case .away: return String(localized: "widget.presence.away", defaultValue: "Away")
        case .idle: return String(localized: "widget.presence.idle", defaultValue: "Idle")
        case .offline: return String(localized: "widget.presence.offline", defaultValue: "Offline")
        }
    }
}

struct FavoriteContact: Codable, Identifiable {
    let id: String
    let name: String
    let avatar: String
    /// Jeton `PresenceState.rawValue` publié par `WidgetDataManager`.
    ///
    /// Optionnel par TOLÉRANCE DE VERSION, pas par indécision : au premier
    /// lancement suivant une mise à jour, le widget peut être rendu à partir
    /// d'un payload écrit par l'ancienne app, qui portait `status` et pas
    /// `presence`. Un champ non optionnel ferait échouer le décodage du
    /// TABLEAU ENTIER — la liste des favoris disparaîtrait jusqu'à la
    /// prochaine publication. Absent ⇒ hors ligne ⇒ pas de pastille.
    let presence: String?
    let accentColor: String

    var presenceState: WidgetPresence {
        presence.flatMap(WidgetPresence.init(rawValue:)) ?? .offline
    }
}
