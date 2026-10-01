import Foundation

/// Ce qu'un visualiseur plein écran peut monter AU-DESSUS de la scène pour qu'on lui parle.
public nonisolated enum FullscreenOverlay: Hashable, Sendable {
    /// La rangée d'émojis ouverte par « Réagir ».
    case reactions
    /// La barre de saisie ouverte par « Répondre ».
    case reply
    /// Un panneau propre à la surface (commentaires, traductions, vues…), nommé par l'hôte.
    case panel(String)
}

/// **Ce que le chrome plein écran PEINT — une loi, pour tous les visualiseurs** (#8878).
///
/// Deux façons de n'avoir aucun contrôle à l'écran, et elles ne se confondent pas :
/// l'IMMERSION (un tap sur le média, ou l'effacement d'une vidéo en lecture) rend
/// l'image entière ; une OUVERTURE (réagir, répondre, un panneau) voile le reste du
/// chrome pour qu'on parle au média en silence — directive porteur #6789 / #6817,
/// d'abord écrite pour la galerie, étendue à toutes les surfaces.
///
/// Valeur immuable : chaque geste rend l'état suivant, jouable sans vue.
public nonisolated struct FullscreenChromeState: Equatable, Sendable {

    public let isImmersive: Bool
    public let overlay: FullscreenOverlay?

    /// Une ouverture n'existe jamais en immersion : elle vient d'un bouton du chrome,
    /// donc d'un chrome visible.
    public init(isImmersive: Bool = false, overlay: FullscreenOverlay? = nil) {
        self.isImmersive = overlay == nil ? isImmersive : false
        self.overlay = overlay
    }

    public static let initial = FullscreenChromeState()

    /// La barre haute, le rail d'actions, la légende et la progression.
    public var showsChrome: Bool { !isImmersive && overlay == nil }

    /// Le voile de lisibilité existe pour détacher le chrome : il part et revient avec lui.
    public var showsScrims: Bool { showsChrome }

    public func isOpen(_ candidate: FullscreenOverlay) -> Bool {
        overlay == candidate
    }

    /// **Un tap sur le média** referme d'abord ce qui est ouvert ; sinon il bascule
    /// l'immersion.
    public func tappingMedia() -> FullscreenChromeState {
        guard overlay == nil else { return FullscreenChromeState() }
        return FullscreenChromeState(isImmersive: !isImmersive)
    }

    /// Ouvrir une surface congédie l'autre : la rangée d'émojis ne flotte jamais
    /// au-dessus d'un champ de saisie.
    public func opening(_ candidate: FullscreenOverlay) -> FullscreenChromeState {
        FullscreenChromeState(overlay: candidate)
    }

    /// Le même bouton ouvre et referme sa surface.
    public func toggling(_ candidate: FullscreenOverlay) -> FullscreenChromeState {
        isOpen(candidate) ? closingOverlay() : opening(candidate)
    }

    public func closingOverlay() -> FullscreenChromeState {
        FullscreenChromeState(isImmersive: isImmersive)
    }

    /// Ce qui ramène le chrome sans rien fermer (un toucher sur la barre, une pause).
    public func revealing() -> FullscreenChromeState {
        FullscreenChromeState(isImmersive: false, overlay: overlay)
    }

    /// **Changer de page** retire ce qui visait la pièce précédente ; l'immersion reste.
    public func turningPage() -> FullscreenChromeState {
        FullscreenChromeState(isImmersive: isImmersive)
    }

    /// Le délai d'effacement automatique : seulement pendant une LECTURE, seulement
    /// quand le chrome est à l'écran et que rien n'est ouvert. Une image ne s'efface
    /// jamais d'elle-même.
    public func autoHideDelay(isPlaying: Bool) -> Double? {
        guard isPlaying, showsChrome else { return nil }
        return FullscreenChromeMetrics.autoHideDelay
    }

    /// L'état au terme de ce délai. Une ouverture survenue entre-temps gagne.
    public func autoHiding() -> FullscreenChromeState {
        overlay == nil ? FullscreenChromeState(isImmersive: true) : self
    }
}
