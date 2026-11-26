import AVFoundation
import AVKit
import Combine
import SwiftUI
import MeeshySDK

// MARK: - Shared AV Player Manager — observateur de temps

extension SharedAVPlayerManager {
    /// Cadence backs off as the device heats up or saves power (WWDC19 #422,
    /// #9880), and is re-armed live by `applyMediaPolicy`. The block runs via
    /// `MainActor.assumeIsolated` — NOT a `Task { @MainActor }` per tick:
    /// `queue: .main` already runs on the MainActor executor. `lastHeartbeat`
    /// is an instance property so the closure captures nothing mutable.
    func armTimeObserver(on player: AVPlayer, interval cadence: Double) {
        if let observer = timeObserver { player.removeTimeObserver(observer) }
        armedTimeObserverInterval = cadence
        let interval = CMTime(seconds: cadence, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self else { return }
                let seconds = time.seconds.isNaN ? 0 : time.seconds
                self.currentTime = seconds
                // Ne crée aucune entrée : retient seulement la dernière position
                // connue, pour clore proprement un visionnage interrompu net.
                self.stretchTracker.observe(max(0, Int(seconds * 1000)))
                if self.isPlaying, seconds - self.lastHeartbeat >= 10 {
                    self.lastHeartbeat = seconds
                    self.emitWatchSample()
                }
            }
        }
    }

    /// Retire l'observateur de temps du lecteur courant.
    func disarmTimeObserver() {
        if let observer = timeObserver, let player {
            player.removeTimeObserver(observer)
        }
        timeObserver = nil
        armedTimeObserverInterval = nil
    }
}
