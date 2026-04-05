import Foundation
import AVFoundation
import Combine

@MainActor
public class AudioPlayerManager: ObservableObject {
    @Published public var isPlaying = false
    @Published public var progress: Double = 0 // 0-1
    @Published public var duration: TimeInterval = 0

    /// Called before playback starts — hook this to PlaybackCoordinator in the app layer.
    public var onWillPlay: (() -> Void)?
    /// Called when stop() is invoked — hook this to allow external stop coordination.
    public var onDidStop: (() -> Void)?

    private var localPlayer: AVAudioPlayer?
    private var streamPlayer: AVPlayer?
    private var timer: Timer?
    private var loadTask: Task<Void, Never>?
    private var streamObserver: Any?
    private var streamCancellables = Set<AnyCancellable>()

    public init() {}

    // MARK: - Play from URL string

    public func play(urlString: String) {
        stop()

        guard !urlString.isEmpty else { return }

        onWillPlay?()

        // Configure audio session for background playback
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            // Silent failure
        }

        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString

        // 1. Check disk cache — play instantly from local file (no network)
        if let localURL = CacheCoordinator.audioLocalFileURL(for: resolved) {
            do {
                let data = try Data(contentsOf: localURL)
                playData(data)
                return
            } catch {
                // Fall through to streaming
            }
        }

        // 2. Stream from network (instant start) + cache in background
        guard let url = URL(string: resolved), url.scheme == "https" || url.scheme == "http" else { return }
        playStream(url: url, cacheKey: resolved)
    }

    private func playData(_ data: Data) {
        do {
            localPlayer = try AVAudioPlayer(data: data)
            localPlayer?.prepareToPlay()
            duration = localPlayer?.duration ?? 0
            localPlayer?.play()
            isPlaying = true
            startLocalProgressTimer()
        } catch {
            // Silent failure
        }
    }

    private func playStream(url: URL, cacheKey: String) {
        let item = AVPlayerItem(url: url)
        let avPlayer = AVPlayer(playerItem: item)
        streamPlayer = avPlayer

        // Observe duration
        item.publisher(for: \.duration)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] cmDuration in
                let seconds = cmDuration.seconds
                if !seconds.isNaN && !seconds.isInfinite && seconds > 0 {
                    self?.duration = seconds
                }
            }
            .store(in: &streamCancellables)

        // Observe playback rate
        avPlayer.publisher(for: \.rate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] rate in
                self?.isPlaying = rate > 0
            }
            .store(in: &streamCancellables)

        // End-of-playback
        NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification, object: item)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.stop()
            }
            .store(in: &streamCancellables)

        // Progress observer
        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        streamObserver = avPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                guard let self, self.duration > 0 else { return }
                self.progress = time.seconds / self.duration
            }
        }

        avPlayer.play()
        isPlaying = true

        // Cache audio data in background for next time
        loadTask = Task {
            _ = try? await CacheCoordinator.shared.audio.data(for: cacheKey)
        }
    }

    // MARK: - Play from local file URL

    public func playLocalFile(url: URL) {
        stop()
        onWillPlay?()

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}

        do {
            let data = try Data(contentsOf: url)
            playData(data)
        } catch {}
    }

    // MARK: - Controls

    public func stop() {
        localPlayer?.stop()
        localPlayer = nil

        if let observer = streamObserver, let sp = streamPlayer {
            sp.removeTimeObserver(observer)
        }
        streamObserver = nil
        streamPlayer?.pause()
        streamPlayer = nil
        streamCancellables.removeAll()

        timer?.invalidate()
        timer = nil
        let wasPlaying = isPlaying
        isPlaying = false
        progress = 0
        duration = 0
        loadTask?.cancel()
        loadTask = nil
        if wasPlaying { onDidStop?() }
    }

    public func togglePlayPause() {
        if let localPlayer {
            if localPlayer.isPlaying {
                localPlayer.pause()
                isPlaying = false
                timer?.invalidate()
            } else {
                onWillPlay?()
                localPlayer.play()
                isPlaying = true
                startLocalProgressTimer()
            }
        } else if let streamPlayer {
            if isPlaying {
                streamPlayer.pause()
            } else {
                onWillPlay?()
                streamPlayer.play()
            }
            // isPlaying updated by rate observer
        }
    }

    // MARK: - Progress Timer (local player only)

    private func startLocalProgressTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let player = self.localPlayer else { return }
                if player.isPlaying {
                    self.progress = player.duration > 0 ? player.currentTime / player.duration : 0
                    if self.progress >= 1.0 {
                        self.stop()
                    }
                }
            }
        }
    }
}
