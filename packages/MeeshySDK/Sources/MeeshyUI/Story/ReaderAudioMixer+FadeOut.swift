import Foundation
import AVFoundation
import os
import MeeshySDK

@MainActor
extension ReaderAudioMixer {
    /// Fond enchaîné vers le silence de TOUTES les entrées (premier plan et
    /// fond) en `duration` secondes, puis arrêt du moteur. Appelé à la fermeture
    /// du lecteur par `PlaybackCoordinator.fadeOutAllExternal` (#9867).
    ///
    /// Le gain suit le temps RÉEL écoulé (`ReaderVolumeRamp`, comme les rampes
    /// d'enveloppe), pas un nombre de réveils ; les rampes d'auteur en cours
    /// sont annulées pour ne pas remonter le volume sous le fondu. Un fondu
    /// dépassé par une autre passe (`stop()`, `play()` à neuf) s'efface sans
    /// arrêter celle-ci.
    public func fadeOutAndStop(duration: TimeInterval = 0.5) async {
        guard isPlaying else { stop(); return }
        cancelVolumeAutomation()
        let epoch = playbackEpoch
        let startHost = mach_absolute_time()
        while playbackEpoch == epoch, !Task.isCancelled {
            let elapsed = Self.delaySeconds(forHostTime: mach_absolute_time(), relativeTo: startHost)
            applyFadeGain(ReaderVolumeRamp.volume(from: 1, to: 0, duration: duration, elapsed: elapsed))
            if ReaderVolumeRamp.isComplete(duration: duration, elapsed: elapsed) { break }
            guard await cancellableSleep(for: ReaderVolumeRamp.step) else { break }
        }
        guard playbackEpoch == epoch else { return }
        stop()
    }

    /// Les rampes d'enveloppe (minuteries d'attente, tâches de rampe) des deux
    /// slots tombent : elles tireraient le volume vers le haut sous un fondu.
    func cancelVolumeAutomation() {
        entries = entries.mapValues { entry in
            entry.fadeTimers.forEach { $0.invalidate() }
            entry.fadeTasks.forEach { $0.cancel() }
            var cleared = entry
            cleared.fadeTimers = []
            cleared.fadeTasks = []
            return cleared
        }
        guard var bg = backgroundEntry else { return }
        bg.fadeTimers.forEach { $0.invalidate() }
        bg.fadeTasks.forEach { $0.cancel() }
        bg.fadeTimers = []
        bg.fadeTasks = []
        backgroundEntry = bg
    }

    /// `gain` ∈ [0, 1] appliqué au volume EFFECTIF de chaque slot — mute global
    /// et mute par piste compris —, jamais au volume courant : multiplier le
    /// courant à chaque pas ferait une descente exponentielle.
    private func applyFadeGain(_ gain: Float) {
        for entry in entries.values {
            entry.node.volume = effectiveVolume(for: entry) * gain
        }
        if let bg = backgroundEntry {
            bg.player.volume = (isMuted ? 0 : bg.targetVolume) * gain
        }
    }
}
