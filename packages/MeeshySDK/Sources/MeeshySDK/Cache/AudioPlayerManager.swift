import Foundation
import AVFoundation
import Combine

@MainActor
public class AudioPlayerManager: ObservableObject {
    @Published public var isPlaying = false
    @Published public var progress: Double = 0 // 0-1
    @Published public var duration: TimeInterval = 0

    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var loadTask: Task<Void, Never>?

    public init() {}

    // MARK: - Play from URL string

    public func play(urlString: String) {
        stop()

        guard !urlString.isEmpty else { return }

        // Configure audio session for background playback
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            // Silent failure
        }

        // Download via cache and play
        loadTask = Task {
            do {
                let data = try await MediaCacheManager.shared.data(for: urlString)
                guard !Task.isCancelled else { return }
                playData(data)
            } catch {
                // Silent failure
            }
        }
    }

    private func playData(_ data: Data) {
        do {
            player = try AVAudioPlayer(data: data)
            player?.prepareToPlay()
            duration = player?.duration ?? 0
            player?.play()
            isPlaying = true
            startProgressTimer()
        } catch {
            // Silent failure
        }
    }

    // MARK: - Play from local file URL

    public func playLocalFile(url: URL) {
        stop()

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
        player?.stop()
        player = nil
        timer?.invalidate()
        timer = nil
        isPlaying = false
        progress = 0
        loadTask?.cancel()
        loadTask = nil
    }

    public func togglePlayPause() {
        guard let player = player else { return }
        if player.isPlaying {
            player.pause()
            isPlaying = false
            timer?.invalidate()
        } else {
            player.play()
            isPlaying = true
            startProgressTimer()
        }
    }

    // MARK: - Progress Timer

    private func startProgressTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self, let player = self.player else { return }
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
