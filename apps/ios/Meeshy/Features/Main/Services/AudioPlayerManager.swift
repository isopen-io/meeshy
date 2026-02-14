import Foundation
import AVFoundation
import SwiftUI

@MainActor
class AudioPlayerManager: ObservableObject {
    @Published var isPlaying = false
    @Published var progress: Double = 0 // 0-1
    @Published var duration: TimeInterval = 0

    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var downloadTask: URLSessionDataTask?

    // MARK: - Play from URL string

    func play(urlString: String) {
        stop()

        guard let url = URL(string: urlString) else { return }

        // Configure audio session
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            // Silent failure
        }

        // Download and play
        downloadTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            guard let data = data, error == nil else { return }
            Task { @MainActor [weak self] in
                self?.playData(data)
            }
        }
        downloadTask?.resume()
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

    // MARK: - Controls

    func stop() {
        player?.stop()
        player = nil
        timer?.invalidate()
        timer = nil
        isPlaying = false
        progress = 0
        downloadTask?.cancel()
        downloadTask = nil
    }

    func togglePlayPause() {
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
