//
//  PiPCallController.swift
//  Meeshy
//
//  Lot 2/3 (PiP système) — orchestre `AVPictureInPictureController` +
//  `AVPictureInPictureVideoCallViewController` pour faire flotter la vidéo
//  distante par-dessus les autres apps. Branche un `PiPVideoRenderer` sur le
//  track distant le temps du PiP (attach sur willStart, detach sur didStop →
//  un seul chemin lourd actif à la fois). Reste agnostique de `CallManager` :
//  les décisions produit (quand démarrer, que faire au restore/stop) passent
//  par des callbacks injectés.
//
//  Le protocole `PiPCallProviding` est WebRTC-free (UIView + AnyObject) pour que
//  `CallManager`/`CallView` l'utilisent sans `#if`. L'implémentation et le choix
//  du singleton sont gardés sous garde de compilation WebRTC ; sinon `NoOpPiPController`.
//

import AVKit
import UIKit
import os

// MARK: - Protocol (WebRTC-free, toujours compilé)

@MainActor
protocol PiPCallProviding: AnyObject {
    /// L'appareil supporte le PiP système (et n'est pas iOS-app-on-Mac).
    var isPiPSupported: Bool { get }
    /// Une fenêtre PiP système est actuellement affichée.
    var isPiPActive: Bool { get }

    /// Prépare le PiP. `sourceView` = la vue vidéo inline à l'écran (d'où le PiP
    /// « émerge »). `remoteTrack` est un `RTCVideoTrack` (typé `AnyObject` pour
    /// garder le protocole WebRTC-free). `onStart` est appelé quand le PiP
    /// démarre, `onRestoreUI` quand l'utilisateur tape pour revenir, `onStop`
    /// quand il se ferme.
    func configure(sourceView: UIView,
                   remoteTrack: AnyObject,
                   autoStart: Bool,
                   onStart: @escaping @MainActor () -> Void,
                   onRestoreUI: @escaping @MainActor () -> Void,
                   onStop: @escaping @MainActor () -> Void)
    /// Ré-attache le renderer à un nouveau track distant (ICE restart) sans
    /// reconstruire le controller. No-op si le PiP n'est pas configuré.
    func updateRemoteTrack(_ remoteTrack: AnyObject)
    /// Ajuste le framerate du PiP (thermal-aware).
    func setMaxFrameRate(_ fps: Int)
    func start()
    func stop()
    func tearDown()
}

/// Repli no-op : WebRTC absent (CI) ou PiP non supporté.
@MainActor
final class NoOpPiPController: PiPCallProviding {
    var isPiPSupported: Bool { false }
    var isPiPActive: Bool { false }
    func configure(sourceView: UIView, remoteTrack: AnyObject, autoStart: Bool,
                   onStart: @escaping @MainActor () -> Void,
                   onRestoreUI: @escaping @MainActor () -> Void,
                   onStop: @escaping @MainActor () -> Void) {}
    func updateRemoteTrack(_ remoteTrack: AnyObject) {}
    func setMaxFrameRate(_ fps: Int) {}
    func start() {}
    func stop() {}
    func tearDown() {}
}

#if canImport(WebRTC)
@preconcurrency import WebRTC

@MainActor
final class PiPCallController: NSObject, PiPCallProviding {

    static let shared = PiPCallController()

    let isPiPSupported: Bool
    var isPiPActive: Bool { pipController?.isPictureInPictureActive ?? false }

    private var pipController: AVPictureInPictureController?
    private var videoCallViewController: AVPictureInPictureVideoCallViewController?
    private let surfaceView = PiPVideoSampleBufferView(frame: CGRect(x: 0, y: 0, width: 160, height: 240))
    private var renderer: PiPVideoRenderer?
    private weak var remoteTrack: RTCVideoTrack?
    private var onStart: (@MainActor () -> Void)?
    private var onRestoreUI: (@MainActor () -> Void)?
    private var onStop: (@MainActor () -> Void)?
    private var desiredFrameRate = QualityThresholds.pipFrameRateDefault

    override init() {
        isPiPSupported = AVPictureInPictureController.isPictureInPictureSupported()
            && !ProcessInfo.processInfo.isiOSAppOnMac
        super.init()
    }

    // MARK: PiPCallProviding

    func configure(sourceView: UIView,
                   remoteTrack: AnyObject,
                   autoStart: Bool,
                   onStart: @escaping @MainActor () -> Void,
                   onRestoreUI: @escaping @MainActor () -> Void,
                   onStop: @escaping @MainActor () -> Void) {
        guard isPiPSupported, let track = remoteTrack as? RTCVideoTrack else { return }
        tearDown()
        self.remoteTrack = track
        self.onStart = onStart
        self.onRestoreUI = onRestoreUI
        self.onStop = onStop

        let videoVC = AVPictureInPictureVideoCallViewController()
        videoVC.preferredContentSize = CGSize(width: 1080, height: 1920)
        surfaceView.frame = videoVC.view.bounds
        surfaceView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        videoVC.view.addSubview(surfaceView)
        self.videoCallViewController = videoVC

        let source = AVPictureInPictureController.ContentSource(
            activeVideoCallSourceView: sourceView,
            contentViewController: videoVC
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.canStartPictureInPictureAutomaticallyFromInline = autoStart
        controller.delegate = self
        self.pipController = controller
    }

    func start() {
        guard let pipController, pipController.isPictureInPicturePossible,
              !pipController.isPictureInPictureActive else { return }
        pipController.startPictureInPicture()
    }

    func stop() {
        pipController?.stopPictureInPicture()
    }

    func updateRemoteTrack(_ remoteTrack: AnyObject) {
        guard pipController != nil,
              let newTrack = remoteTrack as? RTCVideoTrack,
              newTrack !== self.remoteTrack else { return }
        // Ré-attache le renderer (s'il est actif) au nouveau track sans toucher
        // au controller AVKit → le PiP en cours ne saute pas.
        if let renderer {
            self.remoteTrack?.remove(renderer)
            newTrack.add(renderer)
        }
        self.remoteTrack = newTrack
    }

    func setMaxFrameRate(_ fps: Int) {
        desiredFrameRate = fps
        renderer?.setMaxFrameRate(fps)
    }

    func tearDown() {
        // Si un PiP est actif (ex : l'appel se termine pendant que la fenêtre
        // flotte par-dessus une autre app), l'arrêter AVANT de libérer le
        // controller — sinon la fenêtre système reste orpheline à l'écran.
        if let pipController, pipController.isPictureInPictureActive {
            pipController.stopPictureInPicture()
        }
        detachRenderer()
        pipController?.delegate = nil
        pipController = nil
        videoCallViewController = nil
        surfaceView.removeFromSuperview()
        remoteTrack = nil
        onStart = nil
        onRestoreUI = nil
        onStop = nil
        // `PiPCallController` is a singleton, so a thermally-throttled fps from
        // the previous call must not silently carry over into the next one.
        desiredFrameRate = QualityThresholds.pipFrameRateDefault
    }
}

// MARK: - AVPictureInPictureControllerDelegate

extension PiPCallController: AVPictureInPictureControllerDelegate {

    func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
        attachRenderer()
        onStart?()
    }

    /// Tap « revenir » (flèche) → restaurer le plein écran (le delta vs le X).
    func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        onRestoreUI?()
        completionHandler(true)
    }

    /// Fermeture (X système OU après restore) → détache le renderer et notifie.
    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        detachRenderer()
        onStop?()
    }

    func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        Logger.pipController.error("PiP failed to start: \(error.localizedDescription, privacy: .public)")
        detachRenderer()
        onStop?()
    }
}

// MARK: - Renderer attach/detach (un seul chemin lourd à la fois)

extension PiPCallController {

    func attachRenderer() {
        guard renderer == nil, let remoteTrack else { return }
        let renderer = PiPVideoRenderer(displayLayer: surfaceView.displayLayer, maxFrameRate: desiredFrameRate)
        remoteTrack.add(renderer)
        self.renderer = renderer
    }

    func detachRenderer() {
        if let renderer, let remoteTrack {
            remoteTrack.remove(renderer)
        }
        renderer = nil
        // Fuite — vider la file du layer (le surfaceView est un singleton
        // persistant) pour ne pas retenir de CMSampleBuffer entre deux sessions.
        // `renderer.reset()` (async, [weak self]) ne suffisait pas : le renderer
        // est libéré avant que le flush ne tourne. On flush ici sur le main,
        // sûr car plus aucun enqueue ne suivra (renderer détaché + nil).
        flushSurface()
    }

    func flushSurface() {
        if #available(iOS 17.0, *) {
            surfaceView.displayLayer.sampleBufferRenderer.flush()
        } else {
            surfaceView.displayLayer.flush()
        }
    }
}

private extension Logger {
    nonisolated static let pipController = Logger(subsystem: "me.meeshy.app", category: "pip")
}
#endif
