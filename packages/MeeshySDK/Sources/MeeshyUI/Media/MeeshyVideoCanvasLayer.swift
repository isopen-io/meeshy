@preconcurrency import AVFoundation
import QuartzCore
import Foundation

/// CALayer subclass mutualizing AVPlayerLayer + AVPlayerLooper + observers
/// for the Story canvas video paths (`StoryMediaLayer`, `StoryBackgroundLayer`).
///
/// Why a CALayer (not a SwiftUI view) : the Story canvas is built from
/// pure CALayer compositing for performance (backdrop blur MPS, filters,
/// transforms). This atom keeps that architecture intact while sharing
/// the AVPlayer wiring with the SwiftUI side (`MeeshyVideoSurface`).
public final class MeeshyVideoCanvasLayer: CALayer {

    /// The AVPlayerLayer that renders the video. Public so callers can
    /// observe `isReadyForDisplay` if needed.
    // nonisolated(unsafe): the property's storage is treated as nonisolated;
    // the `@preconcurrency import AVFoundation` above defangs the strict
    // Swift 6 isolation check on `AVPlayerLayer()` so the initializer can
    // run from the (nonisolated) CALayer override inits.
    public nonisolated(unsafe) let avPlayerLayer = AVPlayerLayer()

    private var queuePlayer: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var endObserver: NSObjectProtocol?
    private var statusObserver: NSKeyValueObservation?

    /// Fired once `AVPlayerItem.status` transitions to `.readyToPlay`.
    /// Assign BEFORE `attach(url:)` — `observeItem` snapshots the callback at
    /// observation time to avoid capturing `self` in a `@Sendable` closure.
    public var onReadyToPlay: (@Sendable () -> Void)?
    /// Fired when the (non-looping) item plays to end.
    /// Assign BEFORE `attach(url:)` (see `onReadyToPlay`).
    public var onPlaybackEnded: (@Sendable () -> Void)?

    nonisolated public override init() {
        super.init()
        addSublayer(avPlayerLayer)
        avPlayerLayer.videoGravity = .resizeAspectFill
    }

    nonisolated public override init(layer: Any) {
        super.init(layer: layer)
    }

    nonisolated public required init?(coder: NSCoder) {
        fatalError("init(coder:) not supported")
    }

    nonisolated public override func layoutSublayers() {
        super.layoutSublayers()
        avPlayerLayer.frame = bounds
    }

    /// Attach a URL to play. Calling repeatedly tears down the previous
    /// player + observers first (idempotent).
    public func attach(
        url: URL,
        loops: Bool = true,
        muted: Bool = true,
        bufferDuration: Double = 1.0
    ) {
        detach()
        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = bufferDuration
        let queue = AVQueuePlayer(playerItem: item)
        queue.isMuted = muted
        queue.automaticallyWaitsToMinimizeStalling = false
        if loops {
            looper = AVPlayerLooper(player: queue, templateItem: item)
        }
        avPlayerLayer.player = queue
        queuePlayer = queue
        observeItem(item)
    }

    /// `playImmediately(atRate: 1.0)` to bypass rate sync delay.
    public func play() {
        queuePlayer?.playImmediately(atRate: 1.0)
    }

    public func pause() {
        queuePlayer?.pause()
    }

    /// Idempotent teardown : safe to call multiple times.
    public func detach() {
        statusObserver?.invalidate()
        statusObserver = nil
        if let obs = endObserver {
            NotificationCenter.default.removeObserver(obs)
            endObserver = nil
        }
        looper?.disableLooping()
        looper = nil
        queuePlayer?.pause()
        queuePlayer = nil
        avPlayerLayer.player = nil
    }

    private func observeItem(_ item: AVPlayerItem) {
        // Capturer les callbacks `@Sendable` (valeurs Sendable) AVANT de créer les
        // observers, plutôt que `self`. La conformance `Sendable` de la classe est
        // inférée isolée `@MainActor` (feature `InferIsolatedConformances`), donc
        // `self` n'est PAS capturable dans une closure `@Sendable` (KVO /
        // NotificationCenter) — c'est « Sending 'self' risks causing data races ».
        // Les callbacks doivent donc être assignés avant `attach(url:)`.
        let onReady = onReadyToPlay
        let onEnded = onPlaybackEnded
        statusObserver = item.observe(\.status, options: [.new]) { item, _ in
            guard item.status == .readyToPlay, let onReady else { return }
            Task { @MainActor in onReady() }
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { _ in
            guard let onEnded else { return }
            Task { @MainActor in onEnded() }
        }
    }
}
