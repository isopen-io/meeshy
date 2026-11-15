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

/// La loi de l'appui sur une rangée de conversation (#17316). Le tap de la
/// rangée n'a pas de durée maximale : relâcher un appui long qui a déjà fait
/// apparaître l'aperçu le déclenchait aussi, et la conversation s'ouvrait
/// derrière l'aperçu. Un appui qui a montré l'aperçu n'ouvre donc JAMAIS la
/// conversation ; un tap court l'ouvre sans aperçu.
nonisolated struct ConversationRowPress: Equatable, Sendable {
    enum Event: Equatable, Sendable {
        case began
        case longPressRecognized
        case released
        case tapped
    }

    enum Effect: Equatable, Sendable {
        case none
        case showPeek
        case openConversation
    }

    private(set) var hasRaisedPeek = false

    /// Le tap réarme la loi comme le début d'appui : si l'un des deux manque
    /// au rendez-vous, l'appui suivant ouvre quand même.
    mutating func handle(_ event: Event) -> Effect {
        switch event {
        case .began:
            hasRaisedPeek = false
            return .none
        case .longPressRecognized:
            guard !hasRaisedPeek else { return .none }
            hasRaisedPeek = true
            return .showPeek
        case .released:
            return .none
        case .tapped:
            defer { hasRaisedPeek = false }
            return hasRaisedPeek ? .none : .openConversation
        }
    }
}

/// Ce qu'un toucher fait sur l'aperçu ouvert (#17316) : le voile ferme
/// seulement ; la carte, geste explicite, ferme et ouvre la conversation.
nonisolated enum ConversationPeekTouch: Equatable, Sendable {
    case veil
    case card

    enum Effect: Equatable, Sendable {
        case dismiss
        case dismissAndOpen
    }

    var effect: Effect { self == .veil ? .dismiss : .dismissAndOpen }
}
