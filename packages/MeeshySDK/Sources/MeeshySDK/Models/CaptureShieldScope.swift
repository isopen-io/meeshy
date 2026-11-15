import Foundation

/// Quelles pièces d'une visionneuse le bouclier protège — une valeur opaque
/// que l'hôte pose (`captureShieldScope`) et que les pages lisent. `allExcept`
/// est fermé par défaut : une pièce absente de la liste, ou sans identifiant,
/// est protégée.
public struct CaptureShieldScope: Equatable, Sendable {

    private enum Rule: Equatable, Sendable {
        case none
        case all
        case allExcept(Set<String>)
    }

    private let rule: Rule

    private init(rule: Rule) {
        self.rule = rule
    }

    public static let none = CaptureShieldScope(rule: .none)
    public static let all = CaptureShieldScope(rule: .all)

    /// Toutes les pièces sont protégées, sauf celles-ci.
    public static func allExcept(_ freeContentIds: Set<String>) -> CaptureShieldScope {
        CaptureShieldScope(rule: .allExcept(freeContentIds))
    }

    public func shields(_ contentId: String?) -> Bool {
        switch rule {
        case .none: return false
        case .all: return true
        case .allExcept(let free): return contentId.map { !free.contains($0) } ?? true
        }
    }
}
