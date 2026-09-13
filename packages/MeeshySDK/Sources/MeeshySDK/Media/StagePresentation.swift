import CoreGraphics

/// **Par quelle PORTE on est entré en plein cadre** (#6142, spec § 2.3).
///
/// Trois gestes y mènent et ils ne disent pas la même chose — c'est le vrai
/// gain de la loi, pas un raffinement. On s'arrête sur ce qu'on veut REGARDER
/// (appui long), on se laisse porter par ce qu'on veut continuer d'ÉCOUTER
/// (glissement), et le tap reste le geste sans intention.
public enum StageEntry: Equatable, Sendable {
    case tap
    case longPress
    case swipeUp
}

/// **L'état d'immersion de la lecture — un seul, partagé** (spec § 3.2).
///
/// Il remplace cinq booléens divergents (`showControls`, `chromeVisible`,
/// `chromeHidden`, `isFullscreenStorySession`, et deux surfaces qui n'en
/// avaient aucun), nommés différemment et animés différemment. Mais ce n'est
/// pas la convergence qui justifie le type : c'est qu'un booléen ne peut pas
/// porter la RAISON de l'entrée, et que sans elle les deux portes rendraient le
/// même résultat.
///
/// ## Pourquoi il PILOTE la géométrie
///
/// Partout ailleurs dans le dépôt, « immersif » n'est qu'un fondu d'opacité :
/// le média ne bouge pas. Ici `framing` projette l'état sur
/// `MediaStageFraming.Presentation`, donc l'entrée en plein cadre EST un
/// changement de cotes. Un état qui ne commanderait que du chrome laisserait la
/// loi de cadrage sans interrupteur.
///
/// ## Placement
///
/// Dans `MeeshySDK` et non `MeeshyUI`, pour la raison que `MediaStageFraming`
/// et `StoryLetterboxFill` documentent déjà : `MeeshyUI` compile sous
/// `defaultIsolation: MainActor`, donc une conformance `Equatable` qui y naît
/// n'est plus comparable depuis une suite non isolée. Le type ne lit aucun
/// singleton et ne décide pas QUAND entrer — l'orchestration reste app-side.
public enum StagePresentation: Equatable, Sendable {

    /// Le média dans son cadre arrondi, le plateau autour de lui.
    case carded

    /// Le cadre a pris l'écran. `pausedOnEntry` dit par quelle porte on est
    /// entré — et rien d'autre : il ne suit pas la lecture, il se souvient du
    /// geste.
    case full(pausedOnEntry: Bool)

    public var isFull: Bool {
        if case .full = self { return true }
        return false
    }

    /// **L'état cadré n'a emprunté aucune porte**, donc il n'a rien interrompu.
    public var pausedOnEntry: Bool {
        if case .full(let paused) = self { return paused }
        return false
    }

    /// Le plateau — les deux couloirs, la porte de sortie, le menu, le rail —
    /// appartient à l'état cadré. En plein cadre il n'est pas atténué : il n'est
    /// pas là.
    public var showsPlateau: Bool { !isFull }

    /// Ce que l'état commande au solveur de cadrage.
    public var framing: MediaStageFraming.Presentation {
        isFull ? .full : .carded
    }

    /// **La transition, et elle seule.** Le tap BASCULE ; les deux autres
    /// portes ENTRENT — ce qui est la dissymétrie voulue : on sort toujours par
    /// le geste le plus simple, quelle que soit la façon dont on est entré.
    ///
    /// Un appui long sur un média déjà en plein cadre met en pause plutôt que
    /// de ne rien faire : il fait la même chose des deux côtés de la porte,
    /// donc il reste apprenable.
    ///
    /// Un glissement vers le haut alors que le plein cadre est déjà ouvert
    /// n'ouvre rien — `MediaStageGestures.resolveDrag` ne le propose d'ailleurs
    /// pas ; l'identité ici est la ceinture par-dessus la bretelle.
    public func after(_ door: StageEntry) -> StagePresentation {
        switch door {
        case .longPress:
            return .full(pausedOnEntry: true)
        case .tap:
            return isFull ? .carded : .full(pausedOnEntry: false)
        case .swipeUp:
            return isFull ? self : .full(pausedOnEntry: false)
        }
    }
}

/// **Quand la pastille « en pause » se montre.**
///
/// Sans elle, `pausedOnEntry` serait un drapeau que personne ne voit — la
/// définition même d'un état décoratif. Mais la pastille répond à TROIS
/// questions et non à une, et les deux autres sont ce qui l'empêche de mentir.
public enum MediaStagePause {

    /// - `presentation` : est-on entré par la porte qui met en pause ?
    /// - `isPlayable` : y a-t-il seulement quelque chose à arrêter ? Une
    ///   pastille « en pause » au-dessus d'une PHOTO affirmerait l'arrêt de
    ///   rien.
    /// - `isPlaying` : `pausedOnEntry` se souvient du GESTE, jamais de l'état
    ///   de la lecture. Le lecteur qui appuie sur lire ne quitte pas le plein
    ///   cadre ; sans cette troisième question, la pastille flotterait au-dessus
    ///   d'une vidéo qui joue.
    public static func showsBadge(presentation: StagePresentation,
                                  isPlayable: Bool,
                                  isPlaying: Bool) -> Bool {
        presentation.pausedOnEntry && isPlayable && !isPlaying
    }
}

/// **Ce que les gestes du plateau se disputent, tranché hors de toute vue.**
///
/// Un arbitrage de gestes écrit dans un `body` ne se teste qu'au doigt : il
/// paraît juste tant que personne n'essaie la combinaison qu'on n'avait pas en
/// tête. Ces deux règles sont pures, donc les collisions du lot s'éprouvent
/// ligne à ligne.
public enum MediaStageGestures {

    /// Ce qu'un glissement vertical décide. `follows` est le cas nominal : le
    /// média suit le doigt et revient, aucune décision n'étant prise sur une
    /// hésitation.
    public enum DragOutcome: Equatable, Sendable {
        case ignored
        case follows
        case dismisses
        case entersFull
    }

    /// **Le sens tranche la collision.** La galerie fermait au glissement
    /// vertical dans les DEUX sens ; la loi donne le haut à l'entrée en plein
    /// cadre. Une même course de doigt ne peut pas signifier deux choses, donc
    /// le haut OUVRE et le bas ferme — ce dernier gardant le sens physique qu'il
    /// avait déjà, repousser le média vers la bulle dont il vient.
    ///
    /// En plein cadre, le haut n'a plus rien à ouvrir et ne reprend PAS la
    /// fermeture : le même geste ouvrirait dans un état et quitterait tout dans
    /// l'autre, l'ambiguïté la plus coûteuse qu'on puisse poser sur un plein
    /// écran.
    public static func resolveDrag(translation: CGSize,
                                   presentation: StagePresentation,
                                   threshold: CGFloat) -> DragOutcome {
        guard abs(translation.height) > abs(translation.width) else { return .ignored }
        if translation.height <= -threshold, !presentation.isFull { return .entersFull }
        if translation.height >= threshold { return .dismisses }
        return .follows
    }

    /// **Un média déjà transformé a pris le doigt.** Le déplacement d'un média
    /// agrandi est monté en `highPriorityGesture` avec une distance minimale de
    /// 1 pt : armer l'appui long par-dessus ferait arbitrer les deux à chaque
    /// pose, et la première dérive d'un point déciderait laquelle gagne. Le zoom
    /// est déjà une inspection volontaire — il n'a pas besoin d'une seconde
    /// porte vers l'immersion.
    ///
    /// `isActive` désarme les pages voisines que la fenêtre de rendu réalise
    /// sans que personne ne les regarde : sans lui, un appui destiné à la page
    /// courante ouvrirait le plein cadre d'une autre.
    public static func longPressArmed(isActive: Bool, isTransformed: Bool) -> Bool {
        isActive && !isTransformed
    }
}
