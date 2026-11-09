import UIKit

/// Quel menu l'appui long d'une rangée de conversation ouvre (#17242).
///
/// L'aperçu PERSONNALISÉ (`ConversationLongPressPeek`) sert l'iPhone sur TOUTES
/// les versions d'iOS : le menu natif ne laisse ni dimensionner la carte et le
/// menu, ni tirer le menu vers le haut. Là où l'app ouvre plusieurs fenêtres
/// (iPad) sous iOS 26, le menu natif reste : c'est le seul qui coexiste avec le
/// glisser système (`.onDrag`) qui détache une conversation en fenêtre ou la
/// dépose sur une catégorie.
nonisolated enum ConversationRowMenuRoute: Equatable, Sendable {
    case native
    case custom

    static func resolve(supportsMultipleWindows: Bool, nativeMenuAvailable: Bool) -> ConversationRowMenuRoute {
        supportsMultipleWindows && nativeMenuAvailable ? .native : .custom
    }
}

extension ConversationRowMenuRoute {
    /// La route de CET appareil, sur CETTE version d'iOS.
    @MainActor static var current: ConversationRowMenuRoute {
        let windows = UIApplication.shared.supportsMultipleScenes
        guard #available(iOS 26.0, *) else { return resolve(supportsMultipleWindows: windows, nativeMenuAvailable: false) }
        return resolve(supportsMultipleWindows: windows, nativeMenuAvailable: true)
    }
}
