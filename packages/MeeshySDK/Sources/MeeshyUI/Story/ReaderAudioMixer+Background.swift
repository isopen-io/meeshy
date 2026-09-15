import Foundation
import AVFoundation
import MeeshySDK

/// **Le slot de FOND du mixer de lecture, extrait de `ReaderAudioMixer.swift`.**
///
/// Une extension par responsabilité, pas une tranche : le fond a son propre
/// slot (`backgroundEntry`, unique par slide), son propre transport
/// (`startBackground`) et sa propre enveloppe. Le fichier d'origine avait
/// franchi le seuil de 1 000 lignes au-delà duquel le découpage ne se discute
/// pas (budget 2026-09-02).
///
/// Ce qui reste PARTAGÉ vit chez le type et n'est pas recopié ici : la fenêtre
/// de rognage (`scheduleAudio`, le site unique d'où part toute planification),
/// l'enveloppe (`AudioEnvelope`) et les helpers d'horloge hôte. Les membres que
/// cette extension touche sont `internal` pour cette raison — jamais `public`.
// MARK: - Background audio

extension ReaderAudioMixer {
    /// Number of configured background entries (0 or 1).
    public var backgroundClipCount: Int { backgroundEntry == nil ? 0 : 1 }

    /// `true` once `play(originHost:slideKey:)` has scheduled the engine for a
    /// slide. Reset on `teardown()` / `configureBackground(...)` / `stop()`.
    public var hasStartedPlayback: Bool { startedSlideKey != nil }

    /// `true` once `play(originHost:slideKey:)` has scheduled the engine for
    /// THIS specific slide key. The unkeyed `hasStartedPlayback` cannot tell a
    /// fresh slide (audio still caching) apart from the previous slide's pass
    /// that has not been torn down yet — the timeline audio gate (R1) needs the
    /// keyed answer.
    public func hasStartedPlayback(slideKey: String) -> Bool {
        startedSlideKey == slideKey
    }

    /// Configures a single background audio source. Replaces any prior bg entry.
    /// `looping=true` schedules the buffer to repeat sample-accurately.
    ///
    /// `backgroundStartOffset` is derived from `audio.startTime` — the resolved
    /// `StoryAudioPlayerObject` already folds the legacy
    /// `StoryEffects.backgroundAudioStart` into `startTime`, so it is the single
    /// source of truth. Re-configuring drops the idempotence key so the next
    /// `play(...)` re-schedules against the fresh entry.
    public func configureBackground(audio: StoryAudioPlayerObject,
                                    url: URL,
                                    looping: Bool) throws {
        // Tear down any prior background node before re-attaching.
        if let prior = backgroundEntry {
            prior.player.stop()
            prior.fadeTimers.forEach { $0.invalidate() }
            prior.fadeTasks.forEach { $0.cancel() }
            engine.detach(prior.player)
        }
        let file = try AVAudioFile(forReading: url)
        let player = AVAudioPlayerNode()
        engine.attach(player)
        // Connect via canonical format — cf. foreground branch above.
        engine.connect(player,
                       to: engine.mainMixerNode,
                       format: Self.resolveCanonicalFormat(mixer: engine.mainMixerNode))

        let startOffset = Double(audio.startTime ?? 0)
        let resolvedDuration = audio.duration
            ?? Float(file.length) / Float(file.processingFormat.sampleRate)
        // Cf. le commentaire jumeau dans `configure(audios:urls:)` : la durée
        // SOURCE se lit sur le fichier, jamais sur `audio.duration` (qui, une
        // fois rogné, porte la durée occupée sur la timeline, pas celle du
        // fichier). Pas d'intention de rognage déclarée ⇒ `nil`, et
        // `scheduleBackgroundFile` retombe sur `scheduleFile` sans surcoût.
        let trimBounds: MediaTrimBounds? = (audio.sourceStart == nil && audio.sourceEnd == nil)
            ? nil
            : audio.trimBounds(sourceDuration: Double(file.length) / max(file.processingFormat.sampleRate, 1))
        backgroundEntry = BackgroundEntry(
            player: player,
            file: file,
            looping: looping,
            audioId: audio.id,
            targetVolume: audio.volume,
            fadeIn: audio.fadeIn ?? 0,
            fadeOut: audio.fadeOut ?? 0,
            startOffset: startOffset,
            duration: resolvedDuration,
            trimBounds: trimBounds
        )
        backgroundStartOffset = startOffset
        player.volume = isMuted ? 0 : audio.volume
        // A fresh background entry invalidates the last schedule key — the
        // next play() must re-schedule rather than treat it as a re-render.
        startedSlideKey = nil
    }

    // MARK: - Background transport (RC4.2)

    /// Schedules the background entry against a real timeline origin and starts
    /// its node. The background was previously configured-but-muted: this is
    /// the call that actually makes the slide's background music audible.
    /// Invoked from `play(originHost:slideKey:)` after the foreground loop.
    public func startBackground(originHost: UInt64, slideElapsed: Double = 0) {
        guard let bg = backgroundEntry else { return }
        let elapsedInClip = max(0, slideElapsed - bg.startOffset)
        let scheduleAt = AVAudioTime(
            hostTime: originHost
                + ReaderAudioMixer.hostTime(forDelaySeconds: bg.startOffset)
        )
        scheduleBackgroundFile(at: scheduleAt, elapsedInClip: elapsedInClip)
        // Start silent when a fade-in (explicit or default) will ramp the
        // volume up; otherwise play straight at the target volume.
        bg.player.volume = isMuted ? 0 : (bg.fadeIn > 0 ? 0 : bg.targetVolume)
        bg.player.play()
        scheduleExplicitBackgroundFades(originHost: originHost, slideElapsed: slideElapsed)
    }

    /// Schedules the background file and, when `looping`, recursively re-arms
    /// the buffer on completion so the loop has no audible gap.
    private func scheduleBackgroundFile(at scheduleAt: AVAudioTime?, elapsedInClip: Double) {
        guard let bg = backgroundEntry else { return }
        let completion: (@Sendable () -> Void)? = bg.looping ? { @Sendable [weak self] in
            // `_ =` : voir `scheduleFile(originHost:)` — discarde le handle du
            // `Task` pour que la closure retourne `Void`.
            _ = Task { @MainActor [weak self] in
                guard let self,
                      let live = self.backgroundEntry,
                      live.player.isPlaying else { return }
                // `elapsedInClip: 0` ÉCRIT, pas omis : le rebouclage du fond
                // repart au DÉBUT de sa fenêtre — jumeau de la note de
                // `rescheduleLoopedEntry`.
                self.scheduleBackgroundFile(at: nil, elapsedInClip: 0)
            }
        } : nil
        // Même site partagé que le foreground (`scheduleAudio`) : le rebouclage
        // du fond respecte la même fenêtre — sinon la musique de fond rognée
        // rejouerait le fichier ENTIER à partir de la deuxième itération.
        scheduleAudio(node: bg.player, file: bg.file, trimBounds: bg.trimBounds,
                      elapsedInClip: elapsedInClip,
                      at: scheduleAt, completionHandler: completion)
    }

    /// Honours a composer-authored fade on the background entry. When an
    /// explicit fade exists the default envelope (`applyDefaultBackgroundEnvelope`)
    /// stays out of the way — the configuration prevails (RC4.7).
    ///
    /// `slideElapsed` fait descendre au fond la règle d'`AudioEnvelope` que le
    /// foreground applique déjà : un fond entré à mi-fade démarre à SON
    /// amplitude, et un fond entré passé son fade-out ne pose plus DEUX rampes
    /// qui se percutent sur le même `player.volume` (#6580). C'est le cas
    /// nominal du porteur — « lorsqu'on a un son de fond, ouverture en détail
    /// on joue le son directement aligné ».
    private func scheduleExplicitBackgroundFades(originHost: UInt64, slideElapsed: Double) {
        guard let bg = backgroundEntry, bg.hasExplicitFade else { return }
        let envelope = AudioEnvelope.plan(
            elapsedInClip: slideElapsed - bg.startOffset,
            fadeIn: Double(bg.fadeIn),
            fadeOut: Double(bg.fadeOut),
            clipDuration: Double(bg.duration),
            target: bg.targetVolume)
        bg.player.volume = isMuted ? 0 : envelope.initialVolume
        [envelope.fadeIn, envelope.fadeOut].compactMap { $0 }.forEach { ramp in
            scheduleBackgroundVolumeFade(
                from: ramp.from,
                to: ramp.to,
                duration: ramp.duration,
                triggerAt: originHost
                    + ReaderAudioMixer.hostTime(forDelaySeconds: bg.startOffset + ramp.startOffset)
            )
        }
    }

    /// Volume RÉELLEMENT porté par le node du fond — jumelle de
    /// `appliedVolume(for:)`, et le seul seam par lequel un témoin peut dire
    /// qu'un fond entré en cours de piste n'est pas muet.
    func appliedBackgroundVolume() -> Float? {
        backgroundEntry?.player.volume
    }

    // MARK: - Default background envelope (RC4.7)

    /// Applies the product default envelope to the background entry — a gentle
    /// 30 %→100 % fade-in over 1.2 s and a 100 %→5 % fade-out over the last
    /// 0.5 s of the slide.
    ///
    /// Applied ONLY when the slide carries no explicit `fadeIn`/`fadeOut` sound
    /// effect: an authored fade always prevails (`scheduleExplicitBackgroundFades`
    /// already handled it). Safe to call unconditionally — it self-guards.
    public func applyDefaultBackgroundEnvelope(originHost: UInt64,
                                               slideDuration: Double) {
        guard let bg = backgroundEntry, !bg.hasExplicitFade else { return }

        let target = bg.targetVolume
        let floor = target * ReaderAudioMixer.defaultEnvelopeFloorFraction
        let tail = target * ReaderAudioMixer.defaultEnvelopeTailFraction
        let fadeIn = ReaderAudioMixer.defaultEnvelopeFadeInSeconds
        let fadeOut = ReaderAudioMixer.defaultEnvelopeFadeOutSeconds

        // Fade-in 30 % → 100 % over 1.2 s, anchored at the background start.
        bg.player.volume = isMuted ? 0 : floor
        scheduleBackgroundVolumeFade(
            from: floor,
            to: target,
            duration: fadeIn,
            triggerAt: originHost
                + ReaderAudioMixer.hostTime(forDelaySeconds: bg.startOffset)
        )

        // Fade-out 100 % → 5 % finishing exactly at the end of the slide.
        let fadeOutStart = max(bg.startOffset, slideDuration - fadeOut)
        scheduleBackgroundVolumeFade(
            from: target,
            to: tail,
            duration: fadeOut,
            triggerAt: originHost
                + ReaderAudioMixer.hostTime(forDelaySeconds: fadeOutStart)
        )
    }

    /// Schedules a background volume ramp to fire at `hostTrigger`. Mirrors the
    /// foreground `scheduleVolumeFade` but targets the single background node.
    private func scheduleBackgroundVolumeFade(from start: Float,
                                              to end: Float,
                                              duration: TimeInterval,
                                              triggerAt hostTrigger: UInt64) {
        let delaySeconds = ReaderAudioMixer.delaySeconds(forHostTime: hostTrigger,
                                                         relativeTo: mach_absolute_time())
        guard delaySeconds >= 0 else { return }
        let timer = Timer.scheduledTimer(withTimeInterval: delaySeconds, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.runBackgroundVolumeRamp(from: start, to: end, duration: duration)
            }
        }
        if var bg = backgroundEntry {
            bg.fadeTimers.append(timer)
            backgroundEntry = bg
        }
    }

    /// Interpolates the background node volume between `start` and `end` over
    /// `duration`. A 60 Hz step (aligned on the render clock) is imperceptible
    /// because `AVAudioPlayerNode.volume` is sampled per audio render slice.
    private func runBackgroundVolumeRamp(from start: Float,
                                         to end: Float,
                                         duration: TimeInterval) {
        guard let bg = backgroundEntry else { return }
        guard duration > 0 else {
            bg.player.volume = isMuted ? 0 : end
            return
        }
        let stepInterval: TimeInterval = 1.0 / 60.0
        let steps = max(1, Int(duration / stepInterval))
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            for i in 1...steps {
                try? await Task.sleep(nanoseconds: UInt64(stepInterval * 1_000_000_000))
                if Task.isCancelled { return }
                guard let live = self.backgroundEntry else { return }
                let progress = Float(i) / Float(steps)
                let value = start + (end - start) * progress
                live.player.volume = self.isMuted ? 0 : value
            }
            if let live = self.backgroundEntry {
                live.player.volume = self.isMuted ? 0 : end
            }
        }
        if var bg = backgroundEntry {
            bg.fadeTasks.append(task)
            backgroundEntry = bg
        }
    }
}
