import UIKit
import MeeshySDK

/// Le PiP système vu de `CallManager` : configuration de la fenêtre AVKit, ses
/// trois rappels et les deux commandes du bouton. Le collaborateur possède le
/// contrôleur AVKit (construit au premier usage, #7955) et l'état de la fenêtre ;
/// `isSystemPiPActive`, `displayMode` et `pipAnchorGeneration` restent publiés
/// par l'appel (#11522). Les règles vivent dans `CallPiPPolicy` ; ce fichier ne
/// fait que les brancher : entrer en PiP FERME le plein écran
/// (`CallPiPPolicy.displayModeOnStart`), « agrandir » le rouvre, la croix garde
/// l'appel réduit.
@MainActor
final class CallSystemPiPController: CallSystemPiPControllerProviding {
    nonisolated deinit {}

    private weak var call: CallManager?
    private let makePip: @MainActor () -> PiPCallProviding

    /// Paresseux (#7955) : `PiPCallController` monte une vue AVKit à sa naissance.
    private(set) lazy var pip: PiPCallProviding = makePip()
    /// `true` entre un tap « agrandir » (restore) et la fermeture effective du
    /// PiP, pour distinguer ce chemin de la croix système.
    private(set) var pipRestoring = false
    private(set) var pipStartOrigin: CallPiPStartOrigin = .automatic
    private(set) weak var pipConfiguredTrack: AnyObject?
    private(set) weak var pipConfiguredSource: UIView?
    /// Mode d'affichage en vigueur au démarrage de la fenêtre PiP, restauré à sa
    /// fermeture. Poser `.pip` inconditionnellement dégradait en pilule un appel
    /// qui était plein écran (retour dans l'app) ou en bulle (repli manuel).
    ///
    /// `nil` = aucune fenêtre n'a démarré. Indispensable :
    /// `failedToStartPictureInPictureWithError` appelle `onStop` sans qu'`onStart`
    /// ait tiré, et une valeur persistante y ferait restaurer le mode du PiP
    /// PRÉCÉDENT.
    private(set) var pipDisplayModeAtStart: CallDisplayMode?

    init(makePip: @escaping @MainActor () -> PiPCallProviding = CallSystemPiPController.defaultPip) {
        self.makePip = makePip
    }

    static func defaultPip() -> PiPCallProviding {
        #if canImport(WebRTC)
        return PiPCallController.shared
        #else
        return NoOpPiPController()
        #endif
    }

    func attach(to call: CallManager) {
        self.call = call
    }

    /// Le PiP vidéo système rend le flux DISTANT : il peut s'activer dès que le
    /// track distant est présent et la caméra distante allumée, sur un appareil
    /// compatible (≠ iOS-app-on-Mac) — même si la caméra locale est coupée
    /// (escalade vidéo unilatérale d'un appel audio).
    var canActivateSystemPiP: Bool {
        guard let call else { return false }
        return call.hasRemoteVideoTrack && call.isRemoteVideoEnabled && pip.isPiPSupported
    }

    /// Framerate cible du PiP selon l'état thermique (vignette petite → throttle
    /// agressif sous stress). Partagé par la config et le handler thermal.
    func pipFrameRate(for state: ProcessInfo.ThermalState) -> Int {
        switch state {
        case .critical: return QualityThresholds.pipFrameRateCritical
        case .serious: return QualityThresholds.pipFrameRateSerious
        default: return QualityThresholds.pipFrameRateDefault
        }
    }

    func refreshConfiguredTrack(to track: AnyObject) {
        if pipConfiguredTrack != nil { pipConfiguredTrack = track }
    }

    /// Configure le PiP système pour cet appel (appelé par la vue avec la
    /// `sourceView` vidéo inline). No-op si l'appel n'est pas éligible.
    func attachSystemPiP(sourceView: UIView) {
        guard let call, canActivateSystemPiP, let track = call.remoteVideoTrack else { return }
        let trackObject = track as AnyObject
        // Idempotence : `configure()` reconstruit le controller AVKit — et commence
        // par `tearDown()`, donc `stopPictureInPicture()`. Deux ancres coexistent
        // (plein écran + mode réduit) et `PiPSourceAnchor` n'a aucune propriété
        // stockée : chaque bascule de mode monte une nouvelle vue, donc l'identité
        // de la sourceView change à chaque fois. Sans le refus pendant un PiP actif,
        // la bascule tuerait la fenêtre en cours. Cf. `CallPiPPolicy`.
        guard CallPiPPolicy.shouldReconfigure(
            isPiPActive: call.isSystemPiPActive,
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
                self?.call?.displayMode = .fullScreen
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
        call?.isSystemPiPActive = false
        pipRestoring = false
        pipDisplayModeAtStart = nil
        pipStartOrigin = .automatic
        pipConfiguredTrack = nil
        pipConfiguredSource = nil
    }

    /// La fenêtre démarre : le mode en vigueur est mémorisé pour le retour
    /// dans l'app, puis le plein écran se ferme — la source AVKit survit dans
    /// `CallPresentationLayer`, qui la monte hors plein écran.
    func systemPiPDidStart() {
        guard let call else { return }
        pipDisplayModeAtStart = call.displayMode
        call.isSystemPiPActive = true
        if let reduced = CallPiPPolicy.displayModeOnStart(current: call.displayMode) {
            call.displayMode = reduced
        }
    }

    func systemPiPDidStop() {
        guard let call else { return }
        call.isSystemPiPActive = false
        let restored = CallPiPPolicy.displayModeAfterStop(
            callIsActive: call.callState.isActive,
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
        call.pipAnchorGeneration &+= 1
        if let restored { call.displayMode = restored }
    }
}

/// Déclaré après le type : les gardes de l'unité lisent la PREMIÈRE
/// occurrence de chaque signature, qui doit être son corps.
@MainActor
protocol CallSystemPiPControllerProviding: AnyObject {
    var pip: PiPCallProviding { get }
    var canActivateSystemPiP: Bool { get }
    func attach(to call: CallManager)
    func pipFrameRate(for state: ProcessInfo.ThermalState) -> Int
    func refreshConfiguredTrack(to track: AnyObject)
    func attachSystemPiP(sourceView: UIView)
    func startSystemPiP()
    func stopSystemPiP()
    func detachSystemPiP()
}
