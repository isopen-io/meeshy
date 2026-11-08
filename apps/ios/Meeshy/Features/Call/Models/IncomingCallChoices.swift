import Foundation

/// Ce que propose l'écran d'appel entrant (OPUS-5) : quels boutons, et si la
/// vignette de MA caméra s'affiche. Règle pure, testée sans vue.
nonisolated enum IncomingCallAction: Hashable, Sendable {
    case decline
    /// Décrocher caméra coupée : n'existe que pour un appel vidéo.
    case answerWithoutVideo
    case accept
}

nonisolated enum IncomingCallChoices {
    /// De gauche à droite : Refuser, (Sans vidéo), Accepter — Accepter reste
    /// au bord droit, sous le pouce, comme sur tout écran de sonnerie.
    static func actions(isVideoCall: Bool) -> [IncomingCallAction] {
        isVideoCall ? [.decline, .answerWithoutVideo, .accept] : [.decline, .accept]
    }

    /// La vignette ne montre que ce que la caméra filme vraiment : un appel
    /// vidéo dont la piste locale tourne déjà (démarrée à la sonnerie, jamais
    /// envoyée avant le décroché). Caméra refusée ou absente ⇒ pas de vignette
    /// noire.
    /// Caméra coupée dans la barre d'avant le décroché ⇒ la vignette s'efface
    /// avec elle : je vois ce que l'autre verra.
    static func showsSelfPreview(isVideoCall: Bool, hasLocalVideoTrack: Bool, cameraChosen: Bool = true) -> Bool {
        isVideoCall && hasLocalVideoTrack && cameraChosen
    }

    /// La barre « Awa vous verra en décrochant » et ses bascules Micro et
    /// Caméra (vue P17) : un appel vidéo seulement.
    static func showsPreAnswerBar(isVideoCall: Bool) -> Bool {
        isVideoCall
    }

    /// La graine de MA couleur sur ma vignette (loi 4) : mon identifiant,
    /// jamais mon nom. Pas d'identifiant ⇒ pas de couleur inventée.
    static func selfColorKey(userId: String?) -> String? {
        guard let userId, !userId.isEmpty else { return nil }
        return userId
    }

    /// Espace entre les boutons ronds de 70 pt : trois boutons doivent tenir
    /// sur un iPhone de 320 pt de large.
    static func buttonSpacing(for count: Int) -> CGFloat {
        count > 2 ? 36 : 60
    }
}

/// Ce que je choisis AVANT de décrocher (vue P17, #16945) : un état local de
/// l'écran entrant, rien n'en part au pair avant le décroché. La caméra coupée
/// passe par « Répondre sans vidéo », le micro coupé par la coupure posée
/// juste après la réponse.
nonisolated struct IncomingPreAnswer: Equatable, Sendable {
    var microphoneOn = true
    var cameraOn = true

    /// Ce que l'autre recevra en décrochant, dit dans la barre.
    enum Exposure: Equatable, Sendable {
        case seenAndHeard
        case heardOnly
        case seenMuted
        case neither
    }

    /// Le chemin que prend « Répondre ».
    enum Route: Equatable, Sendable {
        case asOffered
        case withoutVideo
    }

    var answersMuted: Bool { !microphoneOn }

    func togglingMicrophone() -> IncomingPreAnswer {
        IncomingPreAnswer(microphoneOn: !microphoneOn, cameraOn: cameraOn)
    }

    func togglingCamera() -> IncomingPreAnswer {
        IncomingPreAnswer(microphoneOn: microphoneOn, cameraOn: !cameraOn)
    }

    /// « Vous verra » n'est promis que si une caméra tourne vraiment :
    /// caméra refusée ou absente ⇒ l'autre ne verra que mon avatar.
    func exposure(isVideoCall: Bool, hasLocalVideoTrack: Bool) -> Exposure {
        let seen = isVideoCall && hasLocalVideoTrack && cameraOn
        switch (seen, microphoneOn) {
        case (true, true): return .seenAndHeard
        case (false, true): return .heardOnly
        case (true, false): return .seenMuted
        case (false, false): return .neither
        }
    }

    func route(isVideoCall: Bool) -> Route {
        isVideoCall && !cameraOn ? .withoutVideo : .asOffered
    }
}
