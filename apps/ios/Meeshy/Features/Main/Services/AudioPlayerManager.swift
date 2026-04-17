import Foundation
import Combine
import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

@MainActor
class AudioPlayerManager: NSObject, ObservableObject, StoppablePlayer, AVAudioPlayerDelegate {
    @Published var isPlaying = false
    @Published var progress: Double = 0 // 0-1
    @Published var duration: TimeInterval = 0

    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var loadTask: Task<Void, Never>?
    private var isRegistered = false
    private var mediaEventsCancellable: AnyCancellable?

    override init() {
        super.init()
        // Subscribe once to audio session events so interruptions (phone
        // calls, Siri) and route changes (AirPods unplugged) pause playback
        // instead of leaving the player in a bad state that would crash
        // when resumed from background.
        mediaEventsCancellable = MediaSessionCoordinator.shared.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleSessionEvent(event)
            }
    }

    private func handleSessionEvent(_ event: MediaSessionCoordinator.Event) {
        switch event {
        case .interruptionBegan, .routeChangedOldDeviceUnavailable:
            if isPlaying {
                player?.pause()
                isPlaying = false
                timer?.invalidate()
            }
        case .interruptionEndedShouldResume:
            // Do not auto-resume from an audio message — user controls it.
            break
        case .interruptionEndedShouldNotResume, .routeChangedOther:
            break
        }
    }

    // MARK: - Play from URL string

    func play(urlString: String) {
        stop()

        guard !urlString.isEmpty else { return }

        registerIfNeeded()
        PlaybackCoordinator.shared.willStartPlaying(external: self)

        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.duckOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}

        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        loadTask = Task {
            do {
                let data = try await CacheCoordinator.shared.audio.data(for: resolved)
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
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.duckOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}

        do {
            let data = try Data(contentsOf: url)
            playData(data)
        } catch {}
    }

    private func playData(_ data: Data) {
        do {
            let newPlayer = try AVAudioPlayer(data: data)
            newPlayer.delegate = self
            newPlayer.prepareToPlay()
            player = newPlayer
            duration = newPlayer.duration
            newPlayer.play()
            isPlaying = true
            startProgressTimer()
        } catch {}
    }

    // MARK: - AVAudioPlayerDelegate

    nonisolated func audioPlayerDidFinishPlaying(_ audioPlayer: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            self?.stop()
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ audioPlayer: AVAudioPlayer, error: Error?) {
        Task { @MainActor [weak self] in
            self?.stop()
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
        loadTask?.cancel()
        loadTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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
