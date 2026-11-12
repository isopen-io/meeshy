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
    /// P17.5 — ma vignette apparaît et disparaît en fondu ; « Réduire les animations » le raccourcit sans le couper.
    static func selfPreviewFadeDuration(reduceMotion: Bool) -> TimeInterval {
        reduceMotion ? CallChromeStow.reducedFadeDuration : 0.25
    }

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
        CallSelfTileStroke.colorKey(showsLocal: true, myId: userId, peerId: nil)
    }

    /// Le disque de l'appelant (avatar et anneaux) ne se pose pas sur son
    /// visage : dès que sa vidéo joue derrière la sonnerie, elle le remplace
    /// (vue P17).
    static func showsCallerDisc(previewPlaysVideo: Bool) -> Bool {
        !previewPlaysVideo
    }

    /// Le glyphe de « Répondre » annonce ce qui partira : caméra coupée dans
    /// la barre ⇒ un téléphone, puisque la réponse part sans vidéo.
    static func acceptGlyph(isVideoCall: Bool, route: IncomingPreAnswer.Route) -> String {
        isVideoCall && route == .asOffered ? "video.fill" : "phone.fill"
    }

    /// Espace entre les boutons ronds de 70 pt : trois boutons doivent tenir
    /// sur un iPhone de 320 pt de large.
    static func buttonSpacing(for count: Int) -> CGFloat {
        count > 2 ? 36 : 60
    }
}

/// La disposition de l'écran entrant : la vue P17 pour un appel vidéo, l'écran
/// livré (#8480) pour un appel audio, que la planche ne redessine pas.
nonisolated enum IncomingCallLayout: Equatable, Sendable {
    case audio
    case videoPreview

    enum AcceptCaption: Equatable, Sendable {
        case accept
        case answer
    }

    static func of(isVideoCall: Bool) -> IncomingCallLayout {
        isVideoCall ? .videoPreview : .audio
    }

    /// P17 : la puce de verre « Appel vidéo entrant » AU-DESSUS du nom.
    var showsTypeChipAboveName: Bool { self == .videoPreview }

    /// L'écran audio garde sa ligne grise et son badge SOUS le nom.
    var showsTypeLineAndBadge: Bool { self == .audio }

    /// P17 : les légendes des boutons ronds sont blanches.
    var whiteCaptions: Bool { self == .videoPreview }

    var acceptCaption: AcceptCaption { self == .videoPreview ? .answer : .accept }
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

    /// Ma caméra filme vraiment : choisie ET vivante. Tant qu'elle démarre
    /// (ou si elle est refusée), ni la phrase ni le bouton ne promettent une
    /// image.
    func cameraFilms(isVideoCall: Bool, hasLocalVideoTrack: Bool) -> Bool {
        isVideoCall && hasLocalVideoTrack && cameraOn
    }

    /// « Vous verra » n'est promis que si une caméra tourne vraiment :
    /// caméra refusée ou absente ⇒ l'autre ne verra que mon avatar.
    func exposure(isVideoCall: Bool, hasLocalVideoTrack: Bool) -> Exposure {
        let seen = cameraFilms(isVideoCall: isVideoCall, hasLocalVideoTrack: hasLocalVideoTrack)
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
