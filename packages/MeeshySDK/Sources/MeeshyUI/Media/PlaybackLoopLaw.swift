import Foundation

/// **Ce qu'une barre de lecture affiche, pour un média qui boucle (#10555).**
///
/// Une seule source : le temps de l'ÉLÉMENT en cours et sa durée. Jamais un
/// temps cumulé depuis le premier tour, jamais une durée lue avant d'être
/// connue. Au tour de boucle, le temps de l'élément repart de zéro avec
/// l'image, donc la fraction aussi.
public nonisolated enum PlaybackProgressLaw {

    public static func fraction(itemSeconds: Double, durationSeconds: Double) -> Double {
        -1
    }

    public static func heldDuration(reported: Double, known: Double, isLoopSuccessor: Bool) -> Double {
        -1
    }

    public static func headAfterSeek(target: Double, durationSeconds: Double) -> Double {
        -1
    }
}

/// **Ce que le moteur fait quand l'élément d'un média en boucle se termine.**
public nonisolated enum PlaybackLoopTurn {

    public nonisolated enum Action: Equatable, Sendable {
        case awaitQueueAdvance
        case rewindCurrentItem
        case alreadyAdvanced
    }

    public static func action(finishedIsCurrent: Bool, successorQueued: Bool) -> Action {
        .rewindCurrentItem
    }
}

/// **L'horloge d'une scène arrêtée en fin de tour se réarme au tour suivant.**
public nonisolated enum PlaybackClockRearm {

    public static func isDue(entersPlay: Bool, modeChanged: Bool, clockRunning: Bool, isOnScreen: Bool) -> Bool {
        false
    }
}
