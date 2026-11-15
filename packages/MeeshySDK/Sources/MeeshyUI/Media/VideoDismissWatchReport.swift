import Foundation

/// Un visionnage vidéo est rapporté à DEUX moments, par deux propriétaires, et
/// l'un peut détruire ce que l'autre vient d'écrire.
///
/// `SharedAVPlayerManager.cleanup()` clôt le visionnage — rapport ET position de
/// reprise persistée — **puis** remet `currentTime` et `duration` à zéro. Le
/// `.onDisappear` du plein écran s'exécute APRÈS : fermer une vidéo EN PAUSE
/// passe par `closePlayer()` → `manager.stop()` → `cleanup()`, si bien que le
/// second rapport lisait un player qui ne décrivait plus rien. `isResumable(0,
/// totalDuration: 0)` rendant faux, il prenait la branche `clear` et **effaçait
/// la position de reprise écrite une fraction de seconde plus tôt** — le défaut
/// exact de l'issue #3908 — en émettant au passage une télémétrie à zéro.
///
/// La règle tient donc en une question posée AVANT toute lecture du player :
/// *décrit-il encore l'attachement dont je parle ?* Sinon, il a déjà tout dit.
/// `nonisolated` parce que c'est une DÉCISION PURE : deux booléens et une durée,
/// aucun état, aucune vue. `MeeshyUI` bascule tout le module en `@MainActor` par
/// défaut (SE-0466, `Package.swift`), si bien qu'un helper sans état hérite
/// d'une isolation dont il n'a que faire — et devient inappelable depuis un
/// témoin synchrone, ce qui a cassé la CI du SDK. Même forme que
/// `StoryCanvasFraming` et `StoryCameraCapture`.
nonisolated enum VideoDismissWatchReport {

    /// Durée minimale d'un visionnage partiel digne d'un rapport.
    static let minimumPartialWatch: TimeInterval = 3

    /// Le rapport de fermeture doit-il partir ?
    ///
    /// - Parameters:
    ///   - complete: la lecture est allée jusqu'au bout (aucun seuil de durée).
    ///   - watchedSeconds: temps passé sur cet écran depuis son ouverture.
    ///   - playerStillHoldsAttachment: le player partagé porte ENCORE cet
    ///     attachement. Faux dès qu'il a été détaché — et c'est alors LUI qui a
    ///     rapporté, avec les vraies valeurs.
    static func shouldReport(
        complete: Bool,
        watchedSeconds: TimeInterval,
        playerStillHoldsAttachment: Bool
    ) -> Bool {
        guard complete || watchedSeconds >= minimumPartialWatch else { return false }
        return playerStillHoldsAttachment
    }
}
