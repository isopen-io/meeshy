import AVFoundation
import Combine
import MeeshySDK
import MeeshyUI
import SwiftUI
import UIKit

/// Le VRAI lecteur d'une séance « ensemble » (#17097) : un `AVPlayer` sur la pièce jointe de la séance, sous la
/// politique média de l'app et la session audio partagée. Il ne décide de rien : `TogetherPlaybackDriver` le commande,
/// et la vue lit sa progression.
@MainActor
final class TogetherAVSurface: ObservableObject, TogetherPlayerSurface {

    enum Phase: Equatable {
        case loading
        case ready
        case unavailable
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var progressMs: Double = 0
    @Published private(set) var durationMs: Double = 0
    @Published private(set) var playing = false

    private(set) var player: AVPlayer?
    private var timeObserver: Any?
    private var statusObservation: NSKeyValueObservation?
    private var holdsSession = false
    var onTick: (() -> Void)?

    nonisolated deinit {}

    func load(attachmentId: String, provider: TogetherProviding = TogetherService.shared) async {
        guard player == nil else { return }
        guard let raw = await provider.mediaURL(attachmentId: attachmentId),
              let url = MeeshyConfig.resolveMediaURL(raw) else {
            phase = .unavailable
            return
        }
        let item = AVPlayerItem(url: url)
        MediaPolicyMonitor.shared.adopt(item, role: .watched)
        let player = AVPlayer(playerItem: item)
        player.automaticallyWaitsToMinimizeStalling = true
        self.player = player
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            let failed = item.status == .failed
            let ready = item.status == .readyToPlay
            let seconds = item.duration.seconds
            Task { @MainActor [weak self] in
                guard let self else { return }
                if failed { self.phase = .unavailable }
                if ready {
                    self.phase = .ready
                    if seconds.isFinite { self.durationMs = seconds * 1000 }
                }
            }
        }
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] time in
            let ms = time.seconds.isFinite ? time.seconds * 1000 : 0
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.progressMs = ms
                self.playing = (self.player?.rate ?? 0) != 0
                self.onTick?()
            }
        }
    }

    /// Le lecteur se rend : plus de son, plus d'observateur, la session audio libérée.
    func stop() {
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        timeObserver = nil
        statusObservation = nil
        player?.pause()
        player = nil
        onTick = nil
        playing = false
        guard holdsSession else { return }
        holdsSession = false
        MediaSessionCoordinator.shared.deactivatePlaybackDeferred()
    }

    // MARK: - TogetherPlayerSurface

    var currentMs: Double {
        guard let seconds = player?.currentTime().seconds, seconds.isFinite else { return 0 }
        return seconds * 1000
    }

    var isPaused: Bool { (player?.rate ?? 0) == 0 }

    func seek(toMs: Double) {
        player?.seek(to: CMTime(seconds: max(0, toMs) / 1000, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        progressMs = max(0, toMs)
    }

    func play(rate: Double) {
        guard let player else { return }
        if !holdsSession {
            holdsSession = true
            MediaSessionCoordinator.shared.activateContentPlayback(.audible)
        }
        player.rate = Float(rate)
        playing = true
    }

    func pause() {
        player?.pause()
        playing = false
    }
}

/// La couche vidéo du lecteur « ensemble » : la couche de la vue EST l'`AVPlayerLayer`.
struct TogetherVideoLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> LayerView {
        let view = LayerView()
        view.playerLayer.videoGravity = .resizeAspect
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ uiView: LayerView, context: Context) {
        if uiView.playerLayer.player !== player { uiView.playerLayer.player = player }
    }

    final class LayerView: UIView {
        nonisolated deinit {}
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer {
            guard let layer = layer as? AVPlayerLayer else {
                preconditionFailure("TogetherVideoLayer layer must be AVPlayerLayer")
            }
            return layer
        }
    }
}
