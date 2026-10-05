import UIKit

// Le PiP système vu de `CallManager` : configuration de la fenêtre AVKit, ses
// trois rappels et les deux commandes du bouton. Sorti de `CallManager.swift`
// (hors budget) au #8435, qui y change ce que le PiP fait du plein écran :
// entrer en PiP le FERME (`CallPiPPolicy.displayModeOnStart`), « agrandir » le
// rouvre, la croix garde l'appel réduit. Les règles vivent dans
// `CallPiPPolicy` ; ce fichier ne fait que les brancher.

extension CallManager {
    /// Configure le PiP système pour cet appel (appelé par la vue avec la
    /// `sourceView` vidéo inline). No-op si l'appel n'est pas éligible.
    func attachSystemPiP(sourceView: UIView) {
        guard canActivateSystemPiP, let track = remoteVideoTrack else { return }
        let trackObject = track as AnyObject
        // Idempotence : `configure()` reconstruit le controller AVKit — et commence
        // par `tearDown()`, donc `stopPictureInPicture()`. Deux ancres coexistent
        // (plein écran + mode réduit) et `PiPSourceAnchor` n'a aucune propriété
        // stockée : chaque bascule de mode monte une nouvelle vue, donc l'identité
        // de la sourceView change à chaque fois. Sans le refus pendant un PiP actif,
        // la bascule tuerait la fenêtre en cours. Cf. `CallPiPPolicy`.
        guard CallPiPPolicy.shouldReconfigure(
            isPiPActive: isSystemPiPActive,
            sourceChanged: pipConfiguredSource !== sourceView,
            trackChanged: pipConfiguredTrack !== trackObject
        ) else { return }
        pipConfiguredSource = sourceView
        pipConfiguredTrack = trackObject
        pip.configure(
            sourceView: sourceView, remoteTrack: trackObject, autoStart: true,
            onStart: { [weak self] in self?.systemPiPDidStart() },
            onRestoreUI: { [weak self] in
                self?.pipRestoring = true
                self?.displayMode = .fullScreen
            },
            onStop: { [weak self] in self?.systemPiPDidStop() }
        )
        // Aligne le framerate sur l'état thermique courant dès la config (le
        // handler thermal ignore les changements hors-appel → évite un héritage
        // périmé entre deux appels).
        pip.setMaxFrameRate(pipFrameRate(for: ProcessInfo.processInfo.thermalState))
    }

    /// Démarre le PiP manuellement (bouton, glissé). No-op si impossible/déjà actif.
    func startSystemPiP() { pipStartOrigin = .manual; pip.start() }

    /// Quitte le PiP manuellement (bouton, second tap). No-op si aucun PiP
    /// n'est actif. Symétrique de `startSystemPiP()` — sans ce wrapper, le
    /// bouton in-app n'avait aucun moyen de fermer une fenêtre PiP déjà
    /// ouverte hormis le chrome système de la fenêtre flottante elle-même.
    func stopSystemPiP() { pip.stop() }

    /// Libère le PiP (fin d'appel / éligibilité perdue).
    func detachSystemPiP() {
        pip.tearDown()
        isSystemPiPActive = false
        pipRestoring = false
        pipDisplayModeAtStart = nil
        pipStartOrigin = .automatic
        pipConfiguredTrack = nil
        pipConfiguredSource = nil
    }

    /// La fenêtre démarre : le mode en vigueur est mémorisé pour le retour
    /// dans l'app, puis le plein écran se ferme — la source AVKit survit dans
    /// `CallPresentationLayer`, qui la monte hors plein écran.
    private func systemPiPDidStart() {
        pipDisplayModeAtStart = displayMode
        isSystemPiPActive = true
        if let reduced = CallPiPPolicy.displayModeOnStart(current: displayMode) {
            displayMode = reduced
        }
    }

    private func systemPiPDidStop() {
        isSystemPiPActive = false
        let restored = CallPiPPolicy.displayModeAfterStop(
            callIsActive: callState.isActive,
            isRestoringUI: pipRestoring,
            modeAtStart: pipDisplayModeAtStart,
            origin: pipStartOrigin,
            appIsForeground: UIApplication.shared.applicationState != .background
        )
        pipRestoring = false
        pipDisplayModeAtStart = nil
        pipStartOrigin = .automatic
        // Ré-armement : la garde de `attachSystemPiP` resterait sinon épinglée
        // sur une ancre morte. Une fenêtre fermée par la croix ne change PAS de
        // mode, donc aucune bascule ne rappellerait `updateUIView` : la
        // génération remonte les ancres, qui reconfigurent sur une vue vivante.
        pipConfiguredSource = nil
        pipConfiguredTrack = nil
        pipAnchorGeneration &+= 1
        if let restored { displayMode = restored }
    }
}
