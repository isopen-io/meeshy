import SwiftUI

/// Mode de publication d'un post (story/status/post). Source unique côté UI ;
/// la valeur transmise au SDK est `rawValue` (String). Aligné sur le backend
/// `POST_VISIBILITIES` (`packages/shared/types/post.ts`).
///
/// Les audiences de CERCLE (#13931, #13939) se lisent au niveau effectif de
/// l'auteur avec le lecteur : Connaissances et au-dessus, Proches et au-dessus,
/// Sang seul. `FRIENDS` garde son sens historique « Amis et au-dessus ».
public enum PostVisibility: String, CaseIterable, Sendable, Codable, Identifiable {
    case `public`     = "PUBLIC"
    case community     = "COMMUNITY"
    case acquaintances = "ACQUAINTANCES"
    case friends       = "FRIENDS"
    case close         = "CLOSE"
    case blood         = "BLOOD"
    case except        = "EXCEPT"
    case only          = "ONLY"
    case `private`     = "PRIVATE"

    public nonisolated var id: String { rawValue }

    /// Une audience SERVIE, lue fail-closed : une valeur que ce client ne connaît
    /// pas se lit RESTREINTE (`PRIVATE`), jamais `PUBLIC`. Afficher « Public » une
    /// audience inconnue, puis la réécrire en public à l'édition, est le risque que
    /// cette lecture referme (#13939).
    public nonisolated init(served raw: String) {
        self = PostVisibility(rawValue: raw.uppercased()) ?? .private
    }

    /// EXCEPT/ONLY nécessitent une sélection d'utilisateurs (picker = incrément 2).
    public nonisolated var requiresUserSelection: Bool {
        self == .except || self == .only
    }

    /// SF Symbol — sûr `nonisolated` (pas d'accès Bundle).
    public nonisolated var icon: String {
        switch self {
        case .public:        return "globe"
        case .community:     return "person.3.fill"
        case .acquaintances: return "hand.wave.fill"
        case .friends:       return "person.2.fill"
        case .close:         return "flame.fill"
        case .blood:         return "drop.fill"
        case .except:        return "person.fill.xmark"
        case .only:          return "person.fill.checkmark"
        case .private:       return "lock.fill"
        }
    }

    @MainActor public var label: String { label(in: .module) }

    nonisolated func label(in bundle: Bundle) -> String {
        switch self {
        case .public:        return String(localized: "post.visibility.public", defaultValue: "Public", bundle: bundle)
        case .community:     return String(localized: "post.visibility.community", defaultValue: "Communautés", bundle: bundle)
        case .acquaintances: return String(localized: "post.visibility.acquaintances", defaultValue: "Connaissances", bundle: bundle)
        case .friends:       return String(localized: "post.visibility.friends", defaultValue: "Amis", bundle: bundle)
        case .close:         return String(localized: "post.visibility.close", defaultValue: "Proches", bundle: bundle)
        case .blood:         return String(localized: "post.visibility.blood", defaultValue: "Sang", bundle: bundle)
        case .except:        return String(localized: "post.visibility.except", defaultValue: "Sauf…", bundle: bundle)
        case .only:          return String(localized: "post.visibility.only", defaultValue: "Seulement…", bundle: bundle)
        case .private:       return String(localized: "post.visibility.private", defaultValue: "Privé", bundle: bundle)
        }
    }

    /// Modes proposés dans les composers : l'échelle des cercles, du plus large
    /// au plus étroit (Public → Communauté → Connaissances → Amis → Proches →
    /// Sang), puis les audiences nommées et le privé.
    public nonisolated static var composerSelectableCases: [PostVisibility] {
        [.public, .community, .acquaintances, .friends, .close, .blood, .except, .only, .private]
    }
}
