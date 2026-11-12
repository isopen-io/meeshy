import Foundation

/// Compteur vivant affiché en pastille sur un barreau de l'échelle. Le
/// descripteur reste pur — `RootView` résout la valeur au rendu.
enum RootMenuBadge: Hashable {
    case unreadNotifications
    case pendingFriendRequests
}

/// Un barreau de l'échelle du bouton flottant menu — description pure (icône,
/// couleur, libellé, destination), donc testable sans SwiftUI.
///
/// Le profil n'a PAS de barreau : il s'ouvre via le 2e tap (ou le long press)
/// sur le bouton avatar. Le DERNIER barreau est la roue dentée (→ préférences
/// générales). L'ordre de `allCases` EST l'ordre de l'échelle.
///
/// Le PREMIER barreau, au plus près du bouton, ouvre le **jeu** (la Progression, #17769), nommé « Ma Légende » —
/// l'objectif visé, pas l'outil (décision porteur du 2026-11-12), sous le trophée du Profil et des Réglages. Il disparaît quand le joueur a masqué le jeu
/// (`ladder(gameHidden:)`). La Progression reste un écran profond, pas un hub : le bandeau du jeu ne
/// se pose pas au-dessus du jeu lui-même.
///
/// Le barreau qui suit les notifications ouvre le **journal d'appels** (`ContactsHubView` sur l'onglet
/// Appels). L'annuaire de contacts n'a plus de barreau dédié : il reste à un
/// swipe de là, sur l'onglet Contacts du même hub.
enum RootMenuLadderEntry: CaseIterable, Hashable {
    case game
    case links
    case notifications
    case calls
    case discover
    case communities
    case settings

    var icon: String {
        switch self {
        case .game: return "trophy.fill"
        case .links: return "link.badge.plus"
        case .notifications: return "bell.fill"
        case .calls: return "phone.fill"
        case .discover: return "sparkle.magnifyingglass"
        case .communities: return "person.3.fill"
        case .settings: return "gearshape.fill"
        }
    }

    var colorHex: String {
        switch self {
        case .game: return "F97316"
        case .links: return "F8B500"
        case .notifications: return "FF6B6B"
        case .calls: return "6366F1"
        case .discover: return "8B5CF6"
        case .communities: return "2ECC71"
        case .settings: return "64748B"
        }
    }

    var label: String {
        switch self {
        case .game:
            return String(localized: "root.menu.game", defaultValue: "Ma Légende")
        case .links:
            return String(localized: "root.menu.links", defaultValue: "Mes liens")
        case .notifications:
            return String(localized: "root.menu.notifications", defaultValue: "Notifications")
        case .calls:
            return String(localized: "root.menu.calls", defaultValue: "Appels")
        case .discover:
            return String(localized: "root.menu.discover", defaultValue: "Découvrir")
        case .communities:
            return String(localized: "root.menu.communities", defaultValue: "Communautés")
        case .settings:
            return String(localized: "root.menu.settings", defaultValue: "Réglages")
        }
    }

    var route: Route {
        switch self {
        case .game: return .progression
        case .links: return .links
        case .notifications: return .notifications
        case .calls: return .contacts(.calls)
        case .discover: return .peopleDiscovery()
        case .communities: return .communityList
        case .settings: return .settings
        }
    }

    var badge: RootMenuBadge? {
        switch self {
        case .notifications: return .unreadNotifications
        case .discover: return .pendingFriendRequests
        case .game, .links, .calls, .communities, .settings: return nil
        }
    }

    /// L'échelle dessinée : toute l'échelle, moins le jeu quand le joueur l'a masqué.
    static func ladder(gameHidden: Bool) -> [RootMenuLadderEntry] {
        gameHidden ? allCases.filter { $0 != .game } : allCases
    }
}
