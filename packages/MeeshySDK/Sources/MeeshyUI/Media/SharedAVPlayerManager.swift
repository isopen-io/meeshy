import AVFoundation
import Combine
import SwiftUI
import MeeshySDK

// MARK: - Shared AV Player Manager

@MainActor
public final class SharedAVPlayerManager: ObservableObject {
    public static let shared = SharedAVPlayerManager()

    @Published public var player: AVPlayer?
    @Published public var isPlaying = false
    @Published public var currentTime: Double = 0
    @Published public var duration: Double = 0
    @Published public var playbackSpeed: PlaybackSpeed = .x1_0
    @Published public var activeURL: String = ""

    private var timeObserver: Any?
    private var cancellables = Set<AnyCancellable>()

    private init() {}

    // MARK: - Load

    public func load(urlString: String) {
        guard !urlString.isEmpty else { return }
        guard urlString != activeURL else { return }

        cleanup()

        guard let url = MeeshyConfig.resolveMediaURL(urlString) else { return }

        activeURL = urlString
        let newPlayer = AVPlayer(url: url)
        player = newPlayer

        setupObservers(for: newPlayer)
    }

    // MARK: - Playback Controls

    public func play() {
        guard let player else { return }
        player.rate = Float(playbackSpeed.rawValue)
        isPlaying = true
    }

    public func pause() {
        player?.pause()
        isPlaying = false
    }

    public func togglePlayPause() {
        if isPlaying { pause() } else { play() }
    }

    public func seek(to seconds: Double) {
        let time = CMTime(seconds: seconds, preferredTimescale: 600)
        player?.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
    }

    public func skip(seconds: Double) {
        let target = min(max(currentTime + seconds, 0), duration)
        seek(to: target)
    }

    public func setSpeed(_ speed: PlaybackSpeed) {
        playbackSpeed = speed
        if isPlaying {
            player?.rate = Float(speed.rawValue)
        }
    }

    public func cycleSpeed() {
        setSpeed(playbackSpeed.next())
    }

    public func stop() {
        cleanup()
        activeURL = ""
    }

    // MARK: - Observers

    private func setupObservers(for player: AVPlayer) {
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                self?.currentTime = time.seconds.isNaN ? 0 : time.seconds
            }
        }

        player.publisher(for: \.rate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] rate in
                guard let self else { return }
                self.isPlaying = rate > 0
            }
            .store(in: &cancellables)

        player.currentItem?.publisher(for: \.duration)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] cmDuration in
                guard let self else { return }
                let seconds = cmDuration.seconds
                self.duration = seconds.isNaN || seconds.isInfinite ? 0 : seconds
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification, object: player.currentItem)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.isPlaying = false
                self.seek(to: 0)
            }
            .store(in: &cancellables)
    }

    // MARK: - Cleanup

    private func cleanup() {
        if let observer = timeObserver, let player {
            player.removeTimeObserver(observer)
        }
        timeObserver = nil
        cancellables.removeAll()
        player?.pause()
        player = nil
        isPlaying = false
        currentTime = 0
        duration = 0
        playbackSpeed = .x1_0
    }
}
