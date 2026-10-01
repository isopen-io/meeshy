import AVFoundation
import Combine
import Foundation
import os

private let logger = Logger(subsystem: "me.meeshy.app.notification-content", category: "player")

/// Ce que la notification déployée demande à un lecteur : le bouton natif
/// (`mediaPlayPauseButtonType`) joue et met en pause, la vue change la vitesse.
@MainActor
protocol NotificationAudioPlayerProviding: AnyObject {
    var isPlaying: Bool { get }
    var rate: Float { get }
    func play()
    func pause()
    func cycleRate()
    func stop()
}

/// **Le lecteur d'un vocal dans la notification déployée** (#8859).
///
/// Il joue le fichier que l'extension de service a déjà attaché quand il existe
/// (aucun réseau), la piste distante élue par le Prisme sinon. La durée
/// DÉCLARÉE sur le fil s'affiche avant que le média ne l'ait mesurée : le
/// compteur n'attend pas le réseau pour dire combien dure le message.
@MainActor
final class NotificationAudioPlayer: ObservableObject, NotificationAudioPlayerProviding {

    @Published private(set) var elapsed: Double = 0
    @Published private(set) var duration: Double
    @Published private(set) var rate: Float = NotificationPlaybackRate.steps[0]
    @Published private(set) var isPlaying = false

    /// Appelé quand la lecture s'arrête d'elle-même (fin du fichier) : le
    /// bouton natif doit alors revenir à « lecture ».
    var onFinish: (() -> Void)?

    private let player: AVPlayer
    private let scopedURL: URL?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    init(url: URL, declaredDurationMs: Int?) {
        scopedURL = url.isFileURL && url.startAccessingSecurityScopedResource() ? url : nil
        player = AVPlayer(url: url)
        duration = declaredDurationMs.map { Double($0) / 1000 } ?? 0
        observe()
    }

    func play() {
        logger.info("play at \(self.elapsed, privacy: .public)")
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        if let item = player.currentItem, item.currentTime() >= item.duration, item.duration.isNumeric {
            player.seek(to: .zero)
        }
        player.playImmediately(atRate: rate)
        isPlaying = true
    }

    func pause() {
        logger.info("pause at \(self.elapsed, privacy: .public)")
        player.pause()
        isPlaying = false
    }

    func cycleRate() {
        rate = NotificationPlaybackRate.next(after: rate)
        if isPlaying { player.rate = rate }
    }

    func stop() {
        player.pause()
        isPlaying = false
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        timeObserver = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        scopedURL?.stopAccessingSecurityScopedResource()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func observe() {
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.tick(time) }
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: player.currentItem, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.finish() }
        }
    }

    private func tick(_ time: CMTime) {
        elapsed = time.seconds.isFinite ? time.seconds : 0
        if let measured = player.currentItem?.duration.seconds, measured.isFinite, measured > 0 {
            duration = measured
        }
    }

    private func finish() {
        logger.info("finished")
        isPlaying = false
        elapsed = duration
        onFinish?()
    }
}
