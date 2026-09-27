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
import CoreGraphics

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

    /// #8435 — entrer en PiP QUITTE le plein écran. Le `fullScreenCover`
    /// restait présenté derrière la fenêtre flottante, et ses rendus vidéo
    /// tournaient pour personne. Le mode réduit le ferme ; la source AVKit
    /// survit, montée par `CallPresentationLayer` hors plein écran.
    /// `nil` = déjà réduit (pastille, bulle), rien à fermer.
    static func displayModeOnStart(current: CallDisplayMode) -> CallDisplayMode? {
        current == .fullScreen ? .pip : nil
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
    ///
    /// #8435 — le mode d'origine n'est rendu QUE sur le retour dans l'app
    /// d'un PiP AUTOMATIQUE (C2). Une fenêtre FERMÉE (la croix, depuis
    /// n'importe où) garde l'appel réduit : c'est ce que la croix demande.
    static func displayModeAfterStop(
        callIsActive: Bool,
        isRestoringUI: Bool,
        modeAtStart: CallDisplayMode?,
        origin: CallPiPStartOrigin,
        appIsForeground: Bool
    ) -> CallDisplayMode? {
        // Appel terminé pendant le PiP : `endCallInternal` a déjà posé le mode
        // porteur du panneau de fin (cf. `shouldRestoreFullScreenBeforeTeardown`).
        guard callIsActive else { return nil }
        // Tap « agrandir » : `onRestoreUI` a déjà posé `.fullScreen` en amont.
        guard !isRestoringUI else { return nil }
        guard origin == .automatic, appIsForeground else { return nil }
        // Le PiP n'a jamais démarré : il n'y a rien à restaurer.
        return modeAtStart
    }

    /// #8435 — le glissé vers le bas d'un appel en DUO quitte le plein écran,
    /// en vidéo comme en audio : vers le PiP système quand l'appel y est
    /// éligible, sinon vers la pastille. En groupe la scène garde ses propres
    /// gestes ; barre d'effets ouverte, ses curseurs gardent les leurs.
    static let swipeDownThreshold: CGFloat = 100

    static func swipeDownOutcome(
        translation: CGFloat,
        isGroup: Bool,
        isEffectsOpen: Bool,
        canSystemPiP: Bool
    ) -> CallSwipeDownOutcome {
        guard !isGroup, !isEffectsOpen, translation > swipeDownThreshold else { return .none }
        return canSystemPiP ? .systemPiP : .pill
    }

    /// #8435 — `PiPCallController.start()` sort en silence quand AVKit ne peut
    /// pas démarrer. Si, le délai passé, aucune fenêtre n'a démarré et que
    /// l'appel est toujours plein écran, le geste retombe sur la pastille.
    static func shouldFallBackToPill(isPiPActive: Bool, displayMode: CallDisplayMode) -> Bool {
        !isPiPActive && displayMode == .fullScreen
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

/// Qui a ouvert la fenêtre PiP : le bouton ou le glissé (`manual`), ou AVKit
/// au passage de l'app en arrière-plan (`automatic`).
enum CallPiPStartOrigin: Equatable, Sendable {
    case manual
    case automatic
}

/// Ce que fait le glissé vers le bas de l'écran d'appel.
enum CallSwipeDownOutcome: Equatable, Sendable {
    case none
    case systemPiP
    case pill
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

    /// #8269 — the activation `configureAudioSession` may request: `nil` means
    /// "apply the configuration, leave activation alone".
    ///
    /// With CallKit, `provider:didActivate` owns activation — and on an
    /// OUTGOING call it lands BEFORE the setup task reaches the configuration.
    /// `setConfiguration(_, active: false)` is `setActive(false)` on the
    /// session CallKit just activated: the audio unit stops, nobody hears
    /// anyone while video keeps flowing (incident 2026-09-27). Without CallKit
    /// (iOS-app-on-Mac, foreground in-app call) we own activation: activate now.
    static func activation(usesCallKit: Bool) -> Bool? {
        usesCallKit ? nil : true
    }
}
