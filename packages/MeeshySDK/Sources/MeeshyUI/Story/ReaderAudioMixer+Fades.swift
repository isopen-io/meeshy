import Foundation
import AVFoundation
import os
import MeeshySDK

@MainActor
extension ReaderAudioMixer {
    /// Schedule fade-in and fade-out volume ramps. node.volume is sampled by
    /// the audio render thread per slice; main-thread updates are picked up
    /// at sub-millisecond granularity which is fine for human-perceptible
    /// fades. Sample-accurate fades would require AVAudioMixerNode +
    /// AVAudioUnitEQ scheduled parameter automation — overkill for the
    /// 0.1-0.5s fade durations the composer typically authors.
    ///
    /// `slideElapsed` est ce qui sépare « ce clip COMMENCE » de « ce clip est
    /// déjà commencé ». Sans elle, un clip entré à mi-fade rejouait sa montée
    /// DEPUIS LE SILENCE, et un clip entré passé son fade-out posait DEUX
    /// rampes qui tiraient à la même milliseconde sur le même `node.volume`
    /// (#6580) — la position avait suivi l'ouverture, l'amplitude non.
    /// `AudioEnvelope` est le site unique de cette règle ; le fond la partage.
    func scheduleFades(for entry: Entry, originHost: UInt64, slideElapsed: Double) {
        if let cycle = entry.envelopeCycle {
            runLoopEnvelope(for: entry, cycle: cycle)
            return
        }
        let envelope = AudioEnvelope.plan(
            elapsedInClip: slideElapsed - Double(entry.startTime),
            fadeIn: Double(entry.fadeIn),
            fadeOut: Double(entry.fadeOut),
            clipDuration: Double(entry.duration),
            target: entry.targetVolume)
        entry.node.volume = (isMuted || entry.isUserMuted) ? 0 : envelope.initialVolume
        [envelope.fadeIn, envelope.fadeOut].compactMap { $0 }.forEach { ramp in
            scheduleVolumeFade(
                entry: entry,
                from: ramp.from,
                to: ramp.to,
                duration: ramp.duration,
                triggerAt: originHost + ReaderAudioMixer.hostTime(
                    forDelaySeconds: Double(entry.startTime) + ramp.startOffset)
            )
        }
    }

    private func scheduleVolumeFade(entry: Entry, from start: Float, to end: Float,
                                    duration: TimeInterval, triggerAt hostTrigger: UInt64) {
        let delaySeconds = ReaderAudioMixer.delaySeconds(forHostTime: hostTrigger,
                                                         relativeTo: mach_absolute_time())
        guard delaySeconds >= 0 else { return }
        // Timer.scheduledTimer fires on the run loop that scheduled it (main),
        // so the body is implicitly main-isolated — `assumeIsolated` lifts the
        // Swift 6 @Sendable closure annotation without an actor hop.
        let timer = Timer.scheduledTimer(withTimeInterval: delaySeconds, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.runVolumeRamp(entry: entry, from: start, to: end,
                                    duration: duration, startHost: hostTrigger)
            }
        }
        if var stored = entries[entry.audioId] {
            stored.fadeTimers.append(timer)
            entries[entry.audioId] = stored
        }
    }

    /// Le volume suit le temps RÉEL écoulé depuis `startHost` (l'instant prévu
    /// du fondu), pas le nombre de réveils : un réveil tardif n'étire plus la
    /// rampe, un déclenchement tardif ne la décale plus (#9702).
    private func runVolumeRamp(entry: Entry, from start: Float, to end: Float,
                               duration: TimeInterval, startHost: UInt64) {
        guard duration > 0 else {
            entry.node.volume = (isMuted || entry.isUserMuted) ? 0 : end
            return
        }
        let audioId = entry.audioId
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                guard let live = self.entries[audioId] else { return }
                let elapsed = ReaderAudioMixer.delaySeconds(forHostTime: mach_absolute_time(),
                                                            relativeTo: startHost)
                let volume = ReaderVolumeRamp.volume(from: start, to: end,
                                                     duration: duration, elapsed: elapsed)
                live.node.volume = (self.isMuted || live.isUserMuted) ? 0 : volume
                if ReaderVolumeRamp.isComplete(duration: duration, elapsed: elapsed) { return }
                guard await cancellableSleep(for: ReaderVolumeRamp.step) else { return }
            }
        }
        if var stored = entries[entry.audioId] {
            stored.fadeTasks.append(task)
            entries[entry.audioId] = stored
        }
    }

    /// **L'enveloppe d'une boucle d'aperçu suit l'horloge de la passe (#10367).**
    ///
    /// Une minuterie par fondu ne vaut que pour le premier tour : le volume se
    /// relit donc à 60 Hz sur l'origine VIVANTE (`playbackStartHostTime`, que
    /// la reprise après pause fait glisser) et la phase du tour
    /// (`ReaderLoopEnvelope`). La tâche s'efface avec SA passe — `stop()`,
    /// `play()` à neuf et `teardown()` avancent l'époque — et tombe avec les
    /// autres rampes sous `fadeOutAndStop`.
    private func runLoopEnvelope(for entry: Entry, cycle: Double) {
        let audioId = entry.audioId
        let epoch = playbackEpoch
        _ = applyLoopEnvelope(audioId: audioId, epoch: epoch, cycle: cycle)
        let task = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard self?.applyLoopEnvelope(audioId: audioId, epoch: epoch, cycle: cycle) == true else { return }
                guard await cancellableSleep(for: ReaderVolumeRamp.step) else { return }
            }
        }
        if var stored = entries[audioId] {
            stored.fadeTasks.append(task)
            entries[audioId] = stored
        }
    }

    /// Pose le volume que dicte la phase du tour. `false` quand la passe n'est
    /// plus la sienne : la tâche s'arrête.
    private func applyLoopEnvelope(audioId: String, epoch: UInt64, cycle: Double) -> Bool {
        guard playbackEpoch == epoch, let live = entries[audioId] else { return false }
        guard let slideElapsed = loopEnvelopeSlideElapsed else { return true }
        let volume = ReaderLoopEnvelope.volume(elapsedInClip: slideElapsed - Double(live.startTime),
                                               cycle: cycle,
                                               fadeIn: Double(live.fadeIn),
                                               fadeOut: Double(live.fadeOut),
                                               target: live.targetVolume)
        live.node.volume = (isMuted || live.isUserMuted) ? 0 : volume
        return true
    }

    /// Écoulé de la passe que lit une enveloppe de boucle — premier plan et
    /// fond (#10369). `nil` hors passe ou en pause : une pause gèle la phase,
    /// l'origine ne glisse qu'à la reprise.
    var loopEnvelopeSlideElapsed: Double? {
        guard pausedAtHostTime == nil, let origin = playbackStartHostTime else { return nil }
        return ReaderAudioMixer.delaySeconds(forHostTime: mach_absolute_time(), relativeTo: origin)
    }
}
