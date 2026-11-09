import CoreGraphics

/// Quel menu l'appui long d'une rangée de conversation ouvre (#17242).
///
/// L'aperçu PERSONNALISÉ (`ConversationLongPressPeek`) sert l'iPhone sur TOUTES
/// les versions d'iOS : le menu natif ne laisse ni dimensionner la carte et le
/// menu, ni tirer le menu vers le haut. L'iPad sous iOS 26 garde le menu natif,
/// le seul qui coexiste avec le glisser système (`.onDrag`) qui détache une
/// conversation en fenêtre ou la dépose sur une catégorie.
nonisolated enum ConversationRowMenuRoute: Equatable, Sendable {
    case native
    case custom

    static func resolve(isPad: Bool, nativeMenuAvailable: Bool) -> ConversationRowMenuRoute {
        isPad && nativeMenuAvailable ? .native : .custom
    }
}
