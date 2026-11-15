import Foundation

/// **Ce que l'app montre d'un appel réduit, selon l'écran où l'on est** (#18457,
/// directive porteur).
///
/// Dans la conversation de l'appel, l'en-tête porte déjà la puce « revenir à
/// l'appel » avec sa durée : la zone « appel en cours » n'a rien à y ajouter.
/// Un appel audio s'y tait donc ; un appel vidéo y montre la vignette
/// flottante (P18), qui n'est pas une redite de la puce. Ailleurs, rien ne
/// change : bandeau en mode pastille, bulle en mode bulle. Le PiP système et
/// le plein écran gardent la main.
nonisolated enum CallReducedPresence: Equatable, Sendable {
    /// Le bandeau du haut (`FloatingCallPillView`).
    case pill
    /// La bulle flottante, là où l'utilisateur l'a posée (`CallBubbleView`).
    case bubble
    /// La vignette vidéo flottante (P18), dans la conversation de l'appel.
    case vignette
    /// Rien d'autre que la puce d'en-tête de la conversation.
    case headerOnly
    /// Aucun appel réduit : plein écran, PiP système ou aucun appel.
    case none

    static func resolve(
        displayMode: CallDisplayMode,
        isActive: Bool,
        isSystemPiPActive: Bool,
        isInCallConversation: Bool,
        isVideo: Bool
    ) -> Self {
        guard isActive, !isSystemPiPActive else { return .none }
        // Filtrage par motif, jamais `==` : la conformance `Equatable` synthétisée de
        // `CallDisplayMode` est isolée au MainActor, cette loi ne l'est pas.
        switch displayMode {
        case .fullScreen:
            return .none
        case .pip:
            if isInCallConversation { return isVideo ? .vignette : .headerOnly }
            return .pill
        case .bubble:
            if isInCallConversation { return isVideo ? .vignette : .headerOnly }
            return .bubble
        }
    }

    /// L'écran visible est-il la conversation de l'appel ? Un appel dont la
    /// conversation est inconnue n'est celle d'aucun écran.
    static func isInCallConversation(visibleConversationId: String?, callConversationId: String?) -> Bool {
        guard let visibleConversationId, let callConversationId else { return false }
        return visibleConversationId == callConversationId
    }

    /// Le palier que la bulle rend : la vignette ne descend jamais au cercle,
    /// qui ne montrerait pas la vidéo ; ailleurs, le palier choisi au pincement.
    static func effectiveTier(stored: CallBubbleSizeTier, presence: CallReducedPresence) -> CallBubbleSizeTier {
        guard presence == .vignette, case .circle = stored else { return stored }
        return .small
    }
}
