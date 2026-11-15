import Foundation

/// Les quatre surfaces de lecture d'un document `CanvasV3`.
public nonisolated enum ScenePlayerMode: Equatable, Sendable {
    case reader
    case preview
    case card
    /// Le réel plein écran (#6745) : il rejoue sa scène en boucle, AVEC le son.
    case reel
}

/// La règle de chaque mode — la seule chose que le player décide de lui-même.
///
/// `startsPaused` ne dépend PAS du mode : tous naissent en pause, y compris le
/// reader, dont la lecture démarre par la commande du viewer.
///
/// `isMuted` et `locksMute` se lisent ENSEMBLE : le premier dit ce que le mode
/// PROPOSE quand l'hôte ne demande rien, le second si l'hôte a seulement le
/// droit de demander. Seule la carte de fil verrouille — un viewer story porte
/// son propre muet persistant, piloté par l'utilisateur au rail.
///
/// **Le réel (#6745) est le seul mode qui boucle AVEC le son.** La carte boucle
/// muette, le reader joue une fois : un réel composé qui passait par l'un
/// perdait soit son son de fond, soit sa boucle. Il porte aussi la chrome — sa
/// progression lit le fil de position.
public nonisolated struct ScenePlayerConfig: Equatable, Sendable {
    public let startsPaused: Bool
    /// Le muet que le mode propose à DÉFAUT de commande de l'hôte.
    public let isMuted: Bool
    /// `true` quand le mode fige le muet PAR CONSTRUCTION : aucune commande de
    /// l'hôte ne le relève. La carte de fil est la seule dans ce cas — E3 s'y
    /// adosse pour n'exposer AUCUN bouton de son (elle n'aurait rien à piloter).
    public let locksMute: Bool
    public let loops: Bool
    public let showsChrome: Bool

    public init(mode: ScenePlayerMode) {
        self.startsPaused = true
        self.isMuted = mode == .card
        self.locksMute = mode == .card
        self.loops = mode == .card || mode == .reel
        self.showsChrome = mode == .reader || mode == .reel
    }
}
