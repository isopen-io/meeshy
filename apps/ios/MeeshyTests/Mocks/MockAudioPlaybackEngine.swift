import Foundation
import Combine
import MeeshyUI
@testable import Meeshy

@MainActor
final class MockAudioPlaybackEngine: AudioPlaybackEngineDriving {
    @Published var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var progress: Double = 0
    @Published var speed: PlaybackSpeed = .x1_0

    var isPlayingPublisher: Published<Bool>.Publisher { $isPlaying }
    var currentTimePublisher: Published<TimeInterval>.Publisher { $currentTime }
    var durationPublisher: Published<TimeInterval>.Publisher { $duration }
    var progressPublisher: Published<Double>.Publisher { $progress }
    var speedPublisher: Published<PlaybackSpeed>.Publisher { $speed }

    private(set) var currentUrl: String?
    var attachmentId: String?
    var onPlaybackFinished: (() -> Void)?

    private(set) var playCallCount = 0
    private(set) var lastPlayedUrl: String?
    private(set) var stopCallCount = 0
    private(set) var togglePlayPauseCallCount = 0
    private(set) var seekFractions: [Double] = []
    private(set) var setSpeedCalls: [PlaybackSpeed] = []

    func play(urlString: String) {
        playCallCount += 1
        lastPlayedUrl = urlString
        currentUrl = urlString
        isPlaying = true
    }

    func playLocal(url: URL) { play(urlString: url.absoluteString) }

    func togglePlayPause() {
        togglePlayPauseCallCount += 1
        isPlaying.toggle()
    }

    func stop() {
        stopCallCount += 1
        isPlaying = false
        currentUrl = nil
    }

    func seek(to fraction: Double) {
        seekFractions.append(fraction)
        progress = fraction
        currentTime = duration * fraction
    }

    func skip(seconds: Double) {
        currentTime = max(0, min(duration, currentTime + seconds))
    }

    func setSpeed(_ speed: PlaybackSpeed) {
        setSpeedCalls.append(speed)
        self.speed = speed
    }

    func cycleSpeed() { setSpeed(speed.next()) }

    func simulateFinishPlayback() {
        isPlaying = false
        currentUrl = nil
        onPlaybackFinished?()
    }

    /// Models the production failure path of `AudioPlaybackManager.play(urlString:)`
    /// when the cache fetch throws (404 CDN, network down, malformed URL).
    /// The fix in B5 forwards `onPlaybackFinished?()` from the catch branch
    /// so the coordinator can advance past the broken audio instead of
    /// stalling silently. This mock surface lets us assert the contract at
    /// the coordinator boundary.
    func simulateLoadFailure() {
        isPlaying = false
        currentUrl = nil
        onPlaybackFinished?()
    }
}
