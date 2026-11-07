import Foundation

/// Ce que propose l'écran d'appel entrant (OPUS-5) : quels boutons, et si la
/// vignette de MA caméra s'affiche. Règle pure, testée sans vue.
enum IncomingCallAction: Hashable, Sendable {
    case decline
    /// Décrocher caméra coupée : n'existe que pour un appel vidéo.
    case answerWithoutVideo
    case accept
}

enum IncomingCallChoices {
    /// De gauche à droite : Refuser, (Sans vidéo), Accepter — Accepter reste
    /// au bord droit, sous le pouce, comme sur tout écran de sonnerie.
    static func actions(isVideoCall: Bool) -> [IncomingCallAction] {
        isVideoCall ? [.decline, .answerWithoutVideo, .accept] : [.decline, .accept]
    }

    /// La vignette ne montre que ce que la caméra filme vraiment : un appel
    /// vidéo dont la piste locale tourne déjà (démarrée à la sonnerie, jamais
    /// envoyée avant le décroché). Caméra refusée ou absente ⇒ pas de vignette
    /// noire.
    static func showsSelfPreview(isVideoCall: Bool, hasLocalVideoTrack: Bool) -> Bool {
        isVideoCall && hasLocalVideoTrack
    }

    /// Espace entre les boutons ronds de 70 pt : trois boutons doivent tenir
    /// sur un iPhone de 320 pt de large.
    static func buttonSpacing(for count: Int) -> CGFloat {
        count > 2 ? 36 : 60
    }
}
