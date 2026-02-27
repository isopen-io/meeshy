import Foundation
import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

@MainActor
class AudioPlayerManager: ObservableObject, StoppablePlayer {
    @Published var isPlaying = false
    @Published var progress: Double = 0 // 0-1
    @Published var duration: TimeInterval = 0

    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var loadTask: Task<Void, Never>?
    private var isRegistered = false

    // MARK: - Play from URL string

    func play(urlString: String) {
        stop()

        guard !urlString.isEmpty else { return }

        registerIfNeeded()
        PlaybackCoordinator.shared.willStartPlaying(external: self)

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}

        loadTask = Task {
            do {
                let data = try await MediaCacheManager.shared.data(for: urlString)
                guard !Task.isCancelled else { return }
                playData(data)
            } catch {}
        }
    }

    // MARK: - Play from local file URL

    func playLocalFile(url: URL) {
        stop()

        registerIfNeeded()
        PlaybackCoordinator.shared.willStartPlaying(external: self)

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}

        do {
            let data = try Data(contentsOf: url)
            playData(data)
        } catch {}
    }

    private func playData(_ data: Data) {
        do {
            player = try AVAudioPlayer(data: data)
            player?.prepareToPlay()
            duration = player?.duration ?? 0
            player?.play()
            isPlaying = true
            startProgressTimer()
        } catch {}
    }

    // MARK: - Controls

    func stop() {
        player?.stop()
        player = nil
        timer?.invalidate()
        timer = nil
        isPlaying = false
        progress = 0
        loadTask?.cancel()
        loadTask = nil
    }

    func togglePlayPause() {
        guard let player = player else { return }
        if player.isPlaying {
            player.pause()
            isPlaying = false
            timer?.invalidate()
        } else {
            registerIfNeeded()
            PlaybackCoordinator.shared.willStartPlaying(external: self)
            player.play()
            isPlaying = true
            startProgressTimer()
        }
    }

    // MARK: - Coordinator Registration

    private func registerIfNeeded() {
        guard !isRegistered else { return }
        PlaybackCoordinator.shared.registerExternal(self)
        isRegistered = true
    }

    deinit {
        // Cleanup handled by weak references in coordinator
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
