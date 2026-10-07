import Foundation

/// **Le bouton pause d'une vidéo plein écran s'efface vite, et revient au doigt**
/// (#9577, directive porteur 2026-10-07).
///
/// Un bouton posé au centre de l'image cache ce qu'on regarde. Il part donc une
/// seconde après le début de la lecture (`FullscreenChromeMetrics
/// .playPauseFadeDelay`, distinct des trois secondes du reste du chrome), un
/// toucher sur le média le ramène et réarme la seconde, et un toucher sur le
/// bouton VISIBLE met en pause. En pause il reste : c'est la seule façon de
/// reprendre.
///
/// Valeur immuable : chaque événement rend l'état suivant, jouable sans vue.
/// `arming` change à chaque réarmement — une tâche clée sur l'état repart donc
/// d'elle-même, sans minuteur à invalider.
public nonisolated struct FullscreenPlayPauseFade: Equatable, Sendable {

    /// Ce que fait un toucher sur le média, du point de vue du bouton.
    public enum MediaTapEffect: Equatable, Sendable {
        /// Le bouton était effacé : le toucher le ramène, et ne fait rien d'autre.
        case reveals
        /// Le bouton est à l'écran : le toucher garde l'effet que l'hôte lui donne.
        case passesThrough
    }

    public let isPlaying: Bool
    public let isRevealed: Bool
    public let arming: Int

    public init() {
        self.init(isPlaying: false, isRevealed: true, arming: 0)
    }

    private init(isPlaying: Bool, isRevealed: Bool, arming: Int) {
        self.isPlaying = isPlaying
        self.isRevealed = isRevealed
        self.arming = arming
    }

    /// Affiché en permanence en pause ; en lecture, seulement tant qu'il est révélé.
    public var isVisible: Bool { !isPlaying || isRevealed }

    /// Le délai avant effacement, ou `nil` s'il n'y a rien à effacer.
    public var fadeDelay: Double? {
        isPlaying && isRevealed ? FullscreenChromeMetrics.playPauseFadeDelay : nil
    }

    public var mediaTapEffect: MediaTapEffect {
        isVisible ? .passesThrough : .reveals
    }

    /// Le moteur change d'état de lecture. Démarrer montre le bouton et arme la
    /// seconde ; mettre en pause le ramène pour de bon. Une valeur IDENTIQUE
    /// n'est pas un changement — le moteur republie.
    public func playback(isPlaying next: Bool) -> FullscreenPlayPauseFade {
        guard next != isPlaying else { return self }
        return FullscreenPlayPauseFade(isPlaying: next, isRevealed: true, arming: arming + 1)
    }

    /// Un toucher sur le média pendant la lecture : le bouton est là, et la
    /// seconde repart. À l'arrêt, rien ne change.
    public func tappingMedia() -> FullscreenPlayPauseFade {
        guard isPlaying else { return self }
        return FullscreenPlayPauseFade(isPlaying: true, isRevealed: true, arming: arming + 1)
    }

    /// L'état au terme du délai. Une pause survenue entre-temps gagne.
    public func fading() -> FullscreenPlayPauseFade {
        guard isPlaying, isRevealed else { return self }
        return FullscreenPlayPauseFade(isPlaying: true, isRevealed: false, arming: arming)
    }
}
