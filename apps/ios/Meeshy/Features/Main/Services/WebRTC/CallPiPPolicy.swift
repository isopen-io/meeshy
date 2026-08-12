//
//  CallPiPPolicy.swift
//  Meeshy
//
//  Lot C (plan 3a) — décisions pures du PiP système et du mode de session
//  audio qu'il exige. Elles vivent hors de `CallManager` parce qu'elles y
//  seraient indécidables : `PiPCallController.shared` n'est pas injecté et
//  `AVPictureInPictureController.isPictureInPictureSupported()` est faux sur
//  simulateur, donc tout `attachSystemPiP` y sort en no-op avant d'atteindre
//  la moindre branche.
//
//  Référence : docs/superpowers/specs/2026-07-31-ios-system-integration-
//  callkit-nowplaying-pip-design.md (C1, C2, C6, C7).
//

import AVFoundation

// MARK: - PiP

enum CallPiPPolicy {

    /// C1 — faut-il (re)construire le contrôleur AVKit ?
    ///
    /// `PiPCallController.configure()` commence par `tearDown()`, qui appelle
    /// `stopPictureInPicture()` : reconfigurer pendant qu'une fenêtre flotte la
    /// tue. Le cas se produit dès qu'une seconde ancre existe — `PiPSourceAnchor`
    /// est un `UIViewRepresentable` sans propriété stockée, donc chaque bascule
    /// de mode d'affichage démonte une ancre et en monte une autre, et
    /// `sourceChanged` est vrai à chaque bascule.
    ///
    /// L'ICE restart n'est pas menacé : un track distant recréé passe par
    /// `pip.updateRemoteTrack(...)`, qui ré-attache le renderer sans toucher au
    /// contrôleur AVKit.
    static func shouldReconfigure(isPiPActive: Bool, sourceChanged: Bool, trackChanged: Bool) -> Bool {
        guard !isPiPActive else { return false }
        return sourceChanged || trackChanged
    }

    /// C2 — mode d'affichage à appliquer quand la fenêtre PiP se ferme.
    /// `nil` = ne rien toucher.
    ///
    /// L'ancien code posait `.pip` inconditionnellement. Un appel PLEIN ÉCRAN
    /// quitté fait démarrer le PiP ; au retour dans l'app AVKit ferme la
    /// fenêtre, et l'appel se retrouvait dégradé en pilule alors que
    /// l'utilisateur revenait précisément à lui. Idem depuis la bulle, qui
    /// disparaissait au profit de la pilule.
    ///
    /// `modeAtStart` est OPTIONNEL, et c'est ce qui rend l'échec de démarrage
    /// sûr : `failedToStartPictureInPictureWithError` appelle `onStop` SANS que
    /// `onStart` ait tiré. Avec une valeur non optionnelle on restaurerait le
    /// mode d'un PiP PRÉCÉDENT — un échec de démarrage après un PiP ouvert
    /// depuis la pilule dégraderait en pilule un appel devenu plein écran.
    static func displayModeAfterStop(
        callIsActive: Bool,
        isRestoringUI: Bool,
        modeAtStart: CallDisplayMode?
    ) -> CallDisplayMode? {
        // Appel terminé pendant le PiP : `endCallInternal` a déjà posé le mode
        // porteur du panneau de fin (cf. `shouldRestoreFullScreenBeforeTeardown`).
        guard callIsActive else { return nil }
        // Tap « revenir » : `onRestoreUI` a déjà posé `.fullScreen` en amont.
        guard !isRestoringUI else { return nil }
        // Le PiP n'a jamais démarré : il n'y a rien à restaurer.
        return modeAtStart
    }

    /// C6 — l'appel se termine pendant que la fenêtre PiP flotte au-dessus
    /// d'une autre app.
    ///
    /// La pilule et la bulle se masquent toutes deux sur `callState.isActive`,
    /// faux dès `.ended`, et le `fullScreenCover` exige
    /// `displayMode == .fullScreen` : sans restauration, l'utilisateur revient
    /// dans une app où l'appel a simplement disparu, sans motif de fin.
    ///
    /// La condition sur `isPiPActive` n'est pas cosmétique : sans elle, chaque
    /// raccrochage depuis la pilule — le flux le plus courant — imposerait un
    /// modal plein écran.
    static func shouldRestoreFullScreenBeforeTeardown(
        isPiPActive: Bool,
        currentMode: CallDisplayMode
    ) -> Bool {
        isPiPActive && currentMode != .fullScreen
    }
}

// MARK: - Session audio

enum CallAudioSessionPolicy {

    /// C7 — `AVPictureInPictureVideoCallViewController` exige `.playAndRecord`
    /// avec le mode `.videoChat`.
    ///
    /// Le prédicat historique était `isVideoEnabled`, la caméra LOCALE. Or
    /// `canActivateSystemPiP` n'exige qu'un track DISTANT : sur escalade vidéo
    /// unilatérale (je reçois la vidéo du correspondant, ma caméra reste
    /// éteinte) la session restait en `.voiceChat` et le PiP pouvait refuser de
    /// démarrer alors que l'UI affichait déjà le layout vidéo. Le prédicat juste
    /// est donc `isVideoUIActive`.
    ///
    /// `.default` sur iOS-app-on-Mac : le voice-processing I/O unit engagé par
    /// `.voiceChat`/`.videoChat` faute sur l'uplink micro et le pair n'entend
    /// rien (CALL-FIX 2026-06-06). La règle vaut pour les deux sites appelants.
    static func mode(videoUIActive: Bool, isiOSAppOnMac: Bool) -> AVAudioSession.Mode {
        guard !isiOSAppOnMac else { return .default }
        return videoUIActive ? .videoChat : .voiceChat
    }
}
