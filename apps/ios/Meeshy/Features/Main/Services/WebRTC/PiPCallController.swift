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
//  Gates de compatibilité : `isPictureInPictureSupported()` ET `!isiOSAppOnMac`
//  (le PiP `ContentSource`+`AVSampleBufferDisplayLayer` est cassé sur Mac).
//

import AVKit
import UIKit
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC

// MARK: - Protocol

@MainActor
protocol PiPCallProviding: AnyObject {
    /// L'appareil supporte le PiP système (et n'est pas iOS-app-on-Mac).
    var isPiPSupported: Bool { get }
    /// Une fenêtre PiP système est actuellement affichée.
    var isPiPActive: Bool { get }

    /// Prépare le PiP pour un appel vidéo donné. `sourceView` = la vue vidéo
    /// inline à l'écran (d'où le PiP « émerge »). `onRestoreUI` est appelé quand
    /// l'utilisateur tape pour revenir ; `onStop` quand le PiP se ferme.
    func configure(sourceView: UIView,
                   remoteTrack: RTCVideoTrack,
                   autoStart: Bool,
                   onRestoreUI: @escaping @MainActor () -> Void,
                   onStop: @escaping @MainActor () -> Void)
    /// Démarre le PiP manuellement (bouton). No-op si impossible/déjà actif.
    func start()
    /// Arrête le PiP (revient plein écran).
    func stop()
    /// Détache le renderer et libère le controller (fin d'appel).
    func tearDown()
}

// MARK: - Controller

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
    private var onRestoreUI: (@MainActor () -> Void)?
    private var onStop: (@MainActor () -> Void)?

    override init() {
        isPiPSupported = AVPictureInPictureController.isPictureInPictureSupported()
            && !ProcessInfo.processInfo.isiOSAppOnMac
        super.init()
    }

    // MARK: PiPCallProviding

    func configure(sourceView: UIView,
                   remoteTrack: RTCVideoTrack,
                   autoStart: Bool,
                   onRestoreUI: @escaping @MainActor () -> Void,
                   onStop: @escaping @MainActor () -> Void) {
        guard isPiPSupported else { return }
        tearDown()
        self.remoteTrack = remoteTrack
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

    func tearDown() {
        detachRenderer()
        pipController?.delegate = nil
        pipController = nil
        videoCallViewController = nil
        remoteTrack = nil
        onRestoreUI = nil
        onStop = nil
    }

    // MARK: - Renderer attach/detach (un seul chemin lourd à la fois)

    private func attachRenderer() {
        guard renderer == nil, let remoteTrack else { return }
        let renderer = PiPVideoRenderer(displayLayer: surfaceView.displayLayer)
        remoteTrack.add(renderer)
        self.renderer = renderer
    }

    private func detachRenderer() {
        if let renderer, let remoteTrack {
            remoteTrack.remove(renderer)
        }
        renderer?.reset()
        renderer = nil
    }
}

// MARK: - AVPictureInPictureControllerDelegate

extension PiPCallController: AVPictureInPictureControllerDelegate {

    func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
        attachRenderer()
    }

    /// Tap « revenir » (flèche) → on restaure le plein écran (le delta vs le X).
    func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        onRestoreUI?()
        completionHandler(true)
    }

    /// Fermeture (X système OU restore) → détache le renderer et notifie.
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

private extension Logger {
    nonisolated static let pipController = Logger(subsystem: "me.meeshy.app", category: "pip")
}
#endif
