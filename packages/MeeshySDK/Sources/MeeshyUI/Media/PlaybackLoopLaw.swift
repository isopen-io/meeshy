import Foundation

/// **Ce qu'une barre de lecture affiche, pour un média qui boucle (#10555).**
///
/// Une seule source : le temps de l'ÉLÉMENT en cours et sa durée. Jamais un
/// temps cumulé depuis le premier tour, jamais une durée lue avant d'être
/// connue. Au tour de boucle, le temps de l'élément repart de zéro avec
/// l'image, donc la fraction aussi — sans compteur de tours à tenir d'accord.
public nonisolated enum PlaybackProgressLaw {

    /// La part de la barre remplie, dans `0...1`. Durée inconnue : zéro.
    public static func fraction(itemSeconds: Double, durationSeconds: Double) -> Double {
        guard durationSeconds.isFinite, durationSeconds > 0, itemSeconds.isFinite else { return 0 }
        return min(1, max(0, itemSeconds / durationSeconds))
    }

    /// La durée à publier quand l'élément en cours rapporte la sienne.
    ///
    /// Le successeur de boucle est le MÊME média : tant qu'il n'a pas relu sa
    /// durée, celle du tour précédent tient. Un autre média n'hérite de rien.
    public static func heldDuration(reported: Double, known: Double, isLoopSuccessor: Bool) -> Double {
        if reported.isFinite, reported > 0 { return reported }
        guard isLoopSuccessor, known.isFinite, known > 0 else { return 0 }
        return known
    }

    /// La tête publiée dès qu'un déplacement est demandé : la cible, bornée au
    /// média. La barre s'y pose au lieu de revenir à l'ancienne position le
    /// temps que le lecteur l'atteigne.
    public static func headAfterSeek(target: Double, durationSeconds: Double) -> Double {
        guard target.isFinite else { return 0 }
        let floor = max(0, target)
        guard durationSeconds.isFinite, durationSeconds > 0 else { return floor }
        return min(floor, durationSeconds)
    }
}

/// **Ce que le moteur fait quand l'élément d'un média en boucle se termine.**
///
/// La notification de fin arrive par le fil principal, après un saut de file :
/// la file de lecture a enchaîné, ou pas encore. Les trois cas se décident ici.
public nonisolated enum PlaybackLoopTurn {

    public nonisolated enum Action: Equatable, Sendable {
        /// Le successeur est en file et la file n'a pas encore enchaîné : elle
        /// le fera seule. Rien à déplacer.
        case awaitQueueAdvance
        /// Aucun successeur : la tête de l'élément fini revient au début.
        case rewindCurrentItem
        /// La file a déjà enchaîné sur le successeur.
        case alreadyAdvanced
    }

    public static func action(finishedIsCurrent: Bool, successorQueued: Bool) -> Action {
        guard finishedIsCurrent else { return .alreadyAdvanced }
        return successorQueued ? .awaitQueueAdvance : .rewindCurrentItem
    }
}

/// **L'horloge d'une scène arrêtée en fin de tour se réarme au tour suivant.**
///
/// La fin d'une scène invalide son lien de lecture. Rentrer en lecture SANS
/// changer de mode — le tour de boucle d'un réel ou d'une carte — ne passait
/// par aucun site qui le recrée : le son et la vidéo repartaient, le playhead
/// restait figé. Un changement de mode arme par son propre chemin ; hors
/// écran, c'est le retour à l'écran qui arme.
public nonisolated enum PlaybackClockRearm {

    public static func isDue(entersPlay: Bool, modeChanged: Bool, clockRunning: Bool, isOnScreen: Bool) -> Bool {
        entersPlay && !modeChanged && !clockRunning && isOnScreen
    }
}
