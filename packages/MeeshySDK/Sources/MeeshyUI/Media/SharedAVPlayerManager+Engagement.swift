import AVFoundation
import AVKit
import Combine
import SwiftUI
import MeeshySDK

// MARK: - Shared AV Player Manager — capture d'engagement et rapport de visionnage

extension SharedAVPlayerManager {
    /// Test seam — émet directement un `WatchSample` sur le publisher.
    public func emitWatchSampleForTesting(positionMs: Int, atMs: Int) {
        watchSamples.send(WatchSample(positionMs: positionMs, atMs: atMs))
    }

    /// Drains the heartbeat samples accumulated for the current watch session and
    /// whether playback reached the end, then resets. Called by a surface when it
    /// finalizes an engagement session (reel switch / story advance / disappear).
    public func drainWatchSamples() -> (samples: [WatchSample], reachedEnd: Bool) {
        let drained = (samples: sessionWatchSamples, reachedEnd: sessionReachedEnd)
        sessionWatchSamples.removeAll()
        sessionReachedEnd = false
        return drained
    }

    /// Émet un sample à partir de l'horloge monotone de lecture
    /// (`watchClockStart`). No-op tant que la lecture n'a pas démarré.
    func emitWatchSample(complete: Bool = false) {
        guard let start = watchClockStart else { return }
        let atMs = Int(Date().timeIntervalSince(start) * 1000)
        let posMs = currentTime.isNaN ? 0 : Int(currentTime * 1000)
        let sample = WatchSample(positionMs: max(0, posMs), atMs: max(0, atMs))
        watchSamples.send(sample)
        sessionWatchSamples.append(sample)
        if complete { sessionReachedEnd = true }
    }

    func reportWatchProgress(complete: Bool) {
        guard let attId = attachmentId else { return }
        guard let start = watchStartTime else { return }
        let watchedSeconds = Date().timeIntervalSince(start)
        // Vidé AVANT la garde, et jamais après : un retour anticipé laisserait
        // la trace dans le traqueur, qui l'attribuerait ensuite à la vidéo
        // SUIVANTE. Le seuil de 3 s protège le réseau, pas la mesure — une
        // trace non vide vaut d'être envoyée quelle qu'ait été sa durée.
        let stretches = stretchTracker.drain()
        guard complete || watchedSeconds >= 3 || !stretches.isEmpty else { return }
        let positionMs = Int(currentTime * 1000)
        let totalDurationMs = Int(duration * 1000)

        // Persist the at-rest watch fraction (monotonic, kept after completion)
        // so the bubble thumbnail can show a discreet progress bar at a glance.
        if complete {
            MediaConsumptionStore.shared.record(fraction: 1, complete: true, for: attId)
            // Natural/forced end → forget the saved RESUME position so a later
            // re-watch starts from 0 (mirrors AudioPlaybackManager.handlePlaybackFinished).
            VideoPlaybackPositionStore.shared.clear(for: attId)
        } else if duration > 0 {
            MediaConsumptionStore.shared.record(fraction: currentTime / duration, complete: false, for: attId)
            saveOrClearResumePosition(currentTime, forAttachment: attId, totalDuration: duration)
        }

        let language = consumedLanguageProvider?()

        let body = AttachmentStatusBody(
            action: "watched",
            playPositionMs: positionMs,
            durationMs: totalDurationMs,
            complete: complete,
            stretches: stretches,
            language: language
        )
        AttachmentStatusReporter.report(attachmentId: attId, body: body)
    }

    /// Saves `elapsed` as the resume point for `id`, or clears any stored
    /// position when `elapsed` sits at either edge of the track (nothing
    /// meaningful to resume). Short tracks are never stored.
    private func saveOrClearResumePosition(_ elapsed: TimeInterval, forAttachment id: String, totalDuration: TimeInterval) {
        guard totalDuration >= VideoResumeRules.minResumableDuration else { return }
        if Self.isResumable(elapsed, totalDuration: totalDuration) {
            VideoPlaybackPositionStore.shared.save(elapsed, for: id)
        } else {
            VideoPlaybackPositionStore.shared.clear(for: id)
        }
    }
}
