import SwiftUI

/// Mode de publication d'un post (story/status/post). Source unique côté UI ;
/// la valeur transmise au SDK est `rawValue` (String). Aligné sur le backend
/// `PostVisibility` (packages/shared/prisma/schema.prisma).
public enum PostVisibility: String, CaseIterable, Sendable, Codable, Identifiable {
    case `public`  = "PUBLIC"
    case community = "COMMUNITY"
    case friends   = "FRIENDS"
    case except    = "EXCEPT"
    case only      = "ONLY"
    case `private` = "PRIVATE"

    public nonisolated var id: String { rawValue }

    /// EXCEPT/ONLY nécessitent une sélection d'utilisateurs (picker = incrément 2).
    public nonisolated var requiresUserSelection: Bool {
        self == .except || self == .only
    }

    /// SF Symbol — sûr `nonisolated` (pas d'accès Bundle).
    public nonisolated var icon: String {
        switch self {
        case .public:    return "globe"
        case .community: return "person.3.fill"
        case .friends:   return "person.2.fill"
        case .except:    return "person.fill.xmark"
        case .only:      return "person.fill.checkmark"
        case .private:   return "lock.fill"
        }
    }

    /// Libellé localisé. `defaultValue` rend la valeur FR même sans entrée catalogue ;
    /// pas de `bundle:` (Bundle.module est MainActor-isolé sous MeeshyUI) → reste sûr.
    public nonisolated var label: String {
        switch self {
        case .public:    return String(localized: "post.visibility.public", defaultValue: "Public")
        case .community: return String(localized: "post.visibility.community", defaultValue: "Communautés")
        case .friends:   return String(localized: "post.visibility.friends", defaultValue: "Contacts")
        case .except:    return String(localized: "post.visibility.except", defaultValue: "Sauf…")
        case .only:      return String(localized: "post.visibility.only", defaultValue: "Seulement…")
        case .private:   return String(localized: "post.visibility.private", defaultValue: "Privé")
        }
    }

    /// Modes proposés dans les composers (incrément 1) — EXCEPT/ONLY masqués
    /// jusqu'au picker d'utilisateurs (incrément 2).
    public nonisolated static var composerSelectableCases: [PostVisibility] {
        [.public, .community, .friends, .except, .only, .private]
    }
}
