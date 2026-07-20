import Foundation
import AVFoundation
import os
import MeeshySDK

/// Sample-accurate foreground-audio mixer for the story reader.
///
/// Replaces the legacy per-clip `AVPlayer` flow which had two latency sources:
///   1. `AVPlayer.play()` startup waits 30-100ms even on prerolled players.
///   2. The reader's 50ms `Timer` polled `currentTime >= startTime` — adding
///      another 0-50ms scheduling jitter on top of (1).
///
/// The mixer keeps a single `AVAudioEngine` running for the lifetime of the
/// reader and pins each audio clip's playback to a precise host time derived
/// from `clip.startTime`. The actual rendering then happens on the audio
/// thread without further main-thread mediation, so a clip whose `startTime`
/// lands halfway between two `CADisplayLink` ticks still fires *exactly* on
/// its expected sample, not at the next tick.
///
/// Apple Core Audio guidance: `AVAudioTime(hostTime:)` is the only reliable
/// cross-node timing reference. `sampleTime` may differ between input and
/// output nodes; `hostTime` resolves to `mach_absolute_time()` and is
/// consistent for every node connected to the same engine.
@MainActor
public final class ReaderAudioMixer {

    public private(set) var isMuted: Bool = false
    public private(set) var isPlaying: Bool = false
    /// Number of foreground audio clips currently configured.
    public var activeClipCount: Int { entries.count }

    private let logger = Logger(subsystem: "me.meeshy.app", category: "media")
    private let engine = AVAudioEngine()

    /// Format canonique de mixage — 48 kHz stereo Float32 (standard broadcast,
    /// natif AAC LC, natif iPhone speaker + AirPods). Avant ce fix, chaque
    /// fichier était connecté au mainMixer avec son `file.processingFormat`
    /// natif (souvent 44.1 kHz pour les voice-over locaux, 22 kHz pour le TTS
    /// Chatterbox, 48 kHz pour les vidéos importées). Le mixer faisait alors
    /// un sample-rate conversion implicite à QUALITÉ MEDIUM (Apple default),
    /// audible sous forme de crackle / artefacts d'aliasing sur les transitions
    /// audio rapides. Connecter explicitement avec ce format force AVAudioEngine
    /// à insérer un AVAudioConverter haute qualité dès la connexion, et le
    /// mainMixer travaille en interne sur un seul format → moins de SRC
    /// imbriqués, signal propre.
    /// Returned via accessor instead of stored `let` initialiser — `AVAudioFormat`
    /// init can theoretically fail under restricted audio sessions (locked
    /// AirPlay, simulator with audio disabled). We fall back through three
    /// safer constructors before giving up to the engine's natural mixer format
    /// (which is guaranteed non-nil because the engine is live).
    private static func resolveCanonicalFormat(mixer: AVAudioMixerNode) -> AVAudioFormat {
        if let std = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2) {
            return std
        }
        if let pcm = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                   sampleRate: 48_000,
                                   channels: 2,
                                   interleaved: false) {
            return pcm
        }
        // Ultimate fallback: mixer's natural output format — already valid by
        // virtue of the engine being live. Sample rate may differ from 48kHz
        // but the format is guaranteed coherent across all attached nodes.
        return mixer.outputFormat(forBus: 0)
    }
    /// One entry per configured clip, keyed by audio object id.
    private var entries: [String: Entry] = [:]
    /// Wall-clock origin for the current playback pass — set on `play()` and
    /// used to derive the sample-accurate host-time targets for each clip.
    private var playbackStartHostTime: UInt64?
    private var didShutdown: Bool = false
    /// Stored background audio entry (at most one per slide).
    private var backgroundEntry: BackgroundEntry?
    private var _duckingEnabled: Bool = false
    private var _duckedBackgroundVolume: Float = 0.5

    /// Timeline offset (seconds, relative to the slide origin) at which the
    /// background entry should begin. Filled by `configureBackground` from the
    /// resolved `StoryAudioPlayerObject.startTime` (which already folds in the
    /// legacy `StoryEffects.backgroundAudioStart`). Defaults to `0`.
    public private(set) var backgroundStartOffset: Double = 0

    /// Identifies the slide content the engine was last scheduled against.
    /// A repeated `play(originHost:slideKey:)` carrying the same key resumes
    /// the transport WITHOUT re-scheduling buffers — this is the idempotence
    /// guard that stops a SwiftUI re-render (`updateUIView` → `setReaderContext`)
    /// from stacking duplicate buffers on the same node (RC4.6, no echo).
    /// Reset by `teardown()` / `configureBackground(...)` / `stop()` so the
    /// next configure pass always re-schedules cleanly.
    private var startedSlideKey: String?

    // MARK: Default background envelope (RC4.7)

    /// Fade-in floor — the default envelope ramps the background from 30 % to
    /// 100 % of its target volume.
    public static let defaultEnvelopeFloorFraction: Float = 0.30
    /// Fade-out tail — the default envelope ramps the background down to 5 %.
    public static let defaultEnvelopeTailFraction: Float = 0.05
    /// Default fade-in duration (seconds).
    public static let defaultEnvelopeFadeInSeconds: Double = 1.2
    /// Default fade-out duration (seconds).
    public static let defaultEnvelopeFadeOutSeconds: Double = 0.5

    public init() {}

    // MARK: - Configure

    /// Configure the mixer for a slide. Call before `play()`. Replaces any
    /// previous configuration and tears down dangling nodes.
    public func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
        teardown()
        logger.info("ReaderAudioMixer.configure audios=\(audios.count) urls=\(urls.count)")
        for audio in audios {
            guard let url = urls[audio.id] else {
                logger.error("ReaderAudioMixer.configure skipping \(audio.id, privacy: .public) — no URL in dict")
                continue
            }
            // AVAudioFile(forReading:) rejects HTTPS URLs with OSStatus 2003334207
            // ("not a file"). Log explicitly so a silent skip becomes diagnosable.
            if !url.isFileURL {
                logger.error("ReaderAudioMixer.configure \(audio.id, privacy: .public) URL is not file:// scheme=\(url.scheme ?? "nil", privacy: .public) — AVAudioFile will reject")
            }
            do {
                let file = try AVAudioFile(forReading: url)
                let node = AVAudioPlayerNode()
                engine.attach(node)
                // Connect via canonical format — AVAudioEngine inserts a
                // high-quality `AVAudioConverter` between this node and the
                // mainMixer when `file.processingFormat` differs (samplerate or
                // channel count). Cf. `canonicalFormat` docstring.
                engine.connect(node,
                               to: engine.mainMixerNode,
                               format: Self.resolveCanonicalFormat(mixer: engine.mainMixerNode))
                let initialVolume = audio.fadeIn ?? 0 > 0 ? 0 : audio.volume
                node.volume = isMuted ? 0 : initialVolume
                entries[audio.id] = Entry(
                    audioId: audio.id,
                    file: file,
                    node: node,
                    startTime: audio.startTime ?? 0,
                    targetVolume: audio.volume,
                    fadeIn: audio.fadeIn ?? 0,
                    fadeOut: audio.fadeOut ?? 0,
                    duration: audio.duration ?? Float(file.length) / Float(file.processingFormat.sampleRate),
                    loop: audio.loop ?? false
                )
            } catch {
                logger.error("ReaderAudioMixer failed to load \(audio.id): \(error.localizedDescription)")
            }
        }
        logger.info("ReaderAudioMixer.configure done entries=\(self.entries.count)")
    }

    // MARK: - Transport

    /// Start playback anchored on a real timeline origin (RC4.4).
    ///
    /// `originHost` is the `mach_absolute_time()` value that materialises the
    /// slide's `t = 0`. The mixer NEVER captures its own origin: foreground
    /// clips are scheduled at `originHost + hostTime(clip.startTime)` and the
    /// background entry at `originHost + hostTime(backgroundStartOffset)`, so
    /// audio stays in phase with the canvas playhead the caller already drives.
    ///
    /// `slideKey` identifies the slide content. When it matches the key the
    /// engine was last scheduled against, the call resumes the transport
    /// without re-scheduling — a re-render (`updateUIView` → `setReaderContext`)
    /// can therefore re-invoke `play` freely without stacking buffers (RC4.6).
    ///
    /// Returns `true` when it scheduled a fresh pass, `false` when it merely
    /// resumed an existing one — the caller uses this to apply the default
    /// fade envelope exactly once per scheduled pass.
    @discardableResult
    public func play(originHost: UInt64, slideKey: String) throws -> Bool {
        logger.info("ReaderAudioMixer.play slideKey=\(slideKey, privacy: .public) entries=\(self.entries.count) bg=\(self.backgroundEntry == nil ? "nil" : "set") resume=\(self.startedSlideKey == slideKey)")
        if startedSlideKey == slideKey {
            try resumeWithoutRescheduling()
            return false
        }
        playbackStartHostTime = originHost
        guard !entries.isEmpty || backgroundEntry != nil else {
            logger.error("ReaderAudioMixer.play nothing scheduled (entries empty + no bg) — silent slide slideKey=\(slideKey, privacy: .public)")
            startedSlideKey = slideKey
            isPlaying = true
            return true
        }
        if !engine.isRunning {
            try engine.start()
        }
        for entry in entries.values {
            scheduleEntry(entry, originHost: originHost)
            entry.node.play()
            // Schedule volume fades on the main runloop. node.volume is read
            // by the audio thread per render slice, so the reads are safe.
            scheduleFades(for: entry, originHost: originHost)
        }
        startBackground(originHost: originHost)
        startedSlideKey = slideKey
        isPlaying = true
        return true
    }

    /// Resumes a previously-scheduled pass (idempotent re-render or `.edit`↔
    /// `.play` bounce) — restarts the engine and any paused nodes WITHOUT
    /// touching the buffer schedule, so no clip is heard twice.
    private func resumeWithoutRescheduling() throws {
        guard !entries.isEmpty || backgroundEntry != nil else {
            isPlaying = true
            return
        }
        if !engine.isRunning {
            try engine.start()
        }
        for entry in entries.values where !entry.node.isPlaying {
            entry.node.play()
        }
        if let bg = backgroundEntry, !bg.player.isPlaying {
            bg.player.play()
        }
        isPlaying = true
    }

    public func pause() {
        for entry in entries.values { entry.node.pause() }
        backgroundEntry?.player.pause()
        if engine.isRunning { engine.pause() }
        isPlaying = false
    }

    public func stop() {
        for entry in entries.values { entry.node.stop() }
        backgroundEntry?.player.stop()
        if engine.isRunning { engine.stop() }
        playbackStartHostTime = nil
        startedSlideKey = nil
        isPlaying = false
    }

    // MARK: - Volume / mute

    public func setVolume(_ volume: Float, for audioId: String) {
        let clamped = max(0, min(1, volume))
        guard var entry = entries[audioId] else { return }
        entry.targetVolume = clamped
        entries[audioId] = entry
        entry.node.volume = effectiveVolume(for: entry)
    }

    public func setMute(_ muted: Bool) {
        isMuted = muted
        for entry in entries.values {
            entry.node.volume = effectiveVolume(for: entry)
        }
        if let bg = backgroundEntry {
            bg.player.volume = muted ? 0 : bg.targetVolume
        }
    }

    /// Mute / unmute a single foreground clip without touching the global
    /// `isMuted` flag (used by the per-chip tap action in the reader). The
    /// background slot is not exposed here — the bg has no dedicated chip.
    public func setMute(_ muted: Bool, for audioId: String) {
        guard var entry = entries[audioId] else { return }
        entry.isUserMuted = muted
        entries[audioId] = entry
        entry.node.volume = effectiveVolume(for: entry)
    }

    public func isMuted(audioId: String) -> Bool {
        entries[audioId]?.isUserMuted ?? false
    }

    private func effectiveVolume(for entry: Entry) -> Float {
        (isMuted || entry.isUserMuted) ? 0 : entry.targetVolume
    }

    // MARK: - Playhead

    /// Temps écoulé depuis l'origine `t = 0` de la slide en cours, en
    /// secondes. Calculé contre `playbackStartHostTime` qui partage le même
    /// référentiel `mach_absolute_time()` que les `AVAudioTime` utilisés pour
    /// scheduler les buffers — c'est donc *le clock audio réel* (sample-
    /// accurate, identique à celui qu'utilise le moteur).
    ///
    /// Retourne `nil` quand aucune slide ne joue (`playbackStartHostTime` nil
    /// après `teardown()` / `stop()`, ou avant le premier `play(...)`).
    public var slideElapsedSeconds: TimeInterval? {
        guard let start = playbackStartHostTime, isPlaying else { return nil }
        // `delaySeconds(forHostTime:relativeTo:)` retourne `target - relativeTo`
        // si positif, sinon `0`. On l'utilise à l'envers (now = target, start
        // = relativeTo) pour obtenir l'écoulé.
        return Self.delaySeconds(forHostTime: mach_absolute_time(), relativeTo: start)
    }

    /// Position de lecture sample-accurate d'un clip particulier (en
    /// secondes, relative au début du fichier audio). Lit
    /// `AVAudioPlayerNode.playerTime(forNodeTime:)` qui est l'API canonique
    /// Apple pour obtenir le temps réel de lecture. Retourne `nil` si le clip
    /// n'a pas encore commencé à rendre (pas de `lastRenderTime`).
    public func clipElapsedSeconds(for audioId: String) -> TimeInterval? {
        guard let entry = entries[audioId],
              let nodeTime = entry.node.lastRenderTime,
              let playerTime = entry.node.playerTime(forNodeTime: nodeTime),
              playerTime.sampleRate > 0
        else { return nil }
        return Double(playerTime.sampleTime) / playerTime.sampleRate
    }

    // MARK: - Lifecycle

    public func shutdown() {
        guard !didShutdown else { return }
        didShutdown = true
        teardown()
    }

    private func teardown() {
        for entry in entries.values {
            entry.node.stop()
            engine.detach(entry.node)
            entry.fadeTimers.forEach { $0.invalidate() }
            entry.fadeTasks.forEach { $0.cancel() }
        }
        entries.removeAll()
        if let bg = backgroundEntry {
            bg.player.stop()
            engine.detach(bg.player)
            bg.fadeTimers.forEach { $0.invalidate() }
            bg.fadeTasks.forEach { $0.cancel() }
            backgroundEntry = nil
        }
        if engine.isRunning {
            engine.stop()
        }
        playbackStartHostTime = nil
        startedSlideKey = nil
        backgroundStartOffset = 0
        isPlaying = false
    }

    // `nonisolated` : ne lit que `didShutdown` (Bool, Sendable) + log. Sans ce
    // mot-clé, le deinit @MainActor implicite est isolé et passe par
    // `swift_task_deinitOnExecutorMainActorBackDeploy`, dont le shim double-free
    // le TaskLocal scope et abort (SIGABRT) à la libération du mixer — y compris
    // via le teardown de StoryCanvasUIView qui possède toujours un audioMixer.
    nonisolated deinit {
        if !didShutdown {
            os.Logger(subsystem: "me.meeshy.app", category: "media").warning(
                "ReaderAudioMixer deinit without shutdown() — owner should call shutdown() before drop to release AVAudioEngine + nodes deterministically."
            )
        }
    }

    // MARK: - Scheduling

    private func scheduleEntry(_ entry: Entry, originHost: UInt64) {
        let delaySeconds = Double(entry.startTime)
        let hostDelta = ReaderAudioMixer.hostTime(forDelaySeconds: delaySeconds)
        let scheduleAt = AVAudioTime(hostTime: originHost + hostDelta)

        let completion: (@Sendable () -> Void)? = entry.loop ? { @Sendable [weak self, audioId = entry.audioId] in
            // Re-schedule the same file at the next "now" host-time so the
            // loop has no audible gap. Using nil scheduleAt ensures playback
            // continues immediately upon completion.
            // `_ =` : discarde le handle du `Task` (fire-and-forget) pour que la
            // closure retourne `Void` — sans ça l'expression `Task` unique est
            // inférée comme valeur de retour (`() -> Task`), incompatible avec
            // le type `@Sendable () -> Void` attendu par `scheduleFile`.
            _ = Task { @MainActor [weak self] in
                self?.rescheduleLoopedEntry(audioId)
            }
        } : nil

        entry.node.scheduleFile(entry.file, at: scheduleAt, completionHandler: completion)
    }

    /// Ré-arme la lecture d'un node loopé depuis le completion handler de la
    /// passe précédente. **Synchrone à dessein** (et non `async`) : appeler
    /// `scheduleFile(_:at:completionHandler:)` hors d'un contexte `async` évite
    /// le diagnostic « consider using asynchronous alternative ». L'overload
    /// `async` suspendrait jusqu'à la FIN de lecture du segment — incompatible
    /// avec le ré-armement fire-and-forget requis pour boucler sans gap audible.
    private func rescheduleLoopedEntry(_ audioId: String) {
        guard let entry = entries[audioId], entry.node.isPlaying else { return }
        entry.node.scheduleFile(entry.file, at: nil, completionHandler: nil)
    }

    /// Schedule fade-in and fade-out volume ramps. node.volume is sampled by
    /// the audio render thread per slice; main-thread updates are picked up
    /// at sub-millisecond granularity which is fine for human-perceptible
    /// fades. Sample-accurate fades would require AVAudioMixerNode +
    /// AVAudioUnitEQ scheduled parameter automation — overkill for the
    /// 0.1-0.5s fade durations the composer typically authors.
    private func scheduleFades(for entry: Entry, originHost: UInt64) {
        if entry.fadeIn > 0 {
            scheduleVolumeFade(
                entry: entry,
                from: 0,
                to: entry.targetVolume,
                duration: TimeInterval(entry.fadeIn),
                triggerAt: originHost + ReaderAudioMixer.hostTime(forDelaySeconds: Double(entry.startTime))
            )
        }
        if entry.fadeOut > 0 {
            let fadeOutTrigger = Double(entry.startTime + entry.duration - entry.fadeOut)
            scheduleVolumeFade(
                entry: entry,
                from: entry.targetVolume,
                to: 0,
                duration: TimeInterval(entry.fadeOut),
                triggerAt: originHost + ReaderAudioMixer.hostTime(forDelaySeconds: fadeOutTrigger)
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
                self?.runVolumeRamp(entry: entry, from: start, to: end, duration: duration)
            }
        }
        if var stored = entries[entry.audioId] {
            stored.fadeTimers.append(timer)
            entries[entry.audioId] = stored
        }
    }

    private func runVolumeRamp(entry: Entry, from start: Float, to end: Float, duration: TimeInterval) {
        guard duration > 0 else {
            entry.node.volume = (isMuted || entry.isUserMuted) ? 0 : end
            return
        }
        // Async ramp instead of Timer because Swift 6 won't let us capture
        // the Timer parameter inside the closure across the @Sendable
        // boundary. Task.sleep on @MainActor is equally smooth at 30 fps and
        // cooperates with structured cancellation if the mixer tears down.
        let audioId = entry.audioId
        let stepInterval: TimeInterval = 1.0 / 30.0
        let steps = max(1, Int(duration / stepInterval))
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            for i in 1...steps {
                try? await Task.sleep(nanoseconds: UInt64(stepInterval * 1_000_000_000))
                if Task.isCancelled { return }
                guard let live = self.entries[audioId] else { return }
                let progress = Float(i) / Float(steps)
                let v = start + (end - start) * progress
                live.node.volume = (self.isMuted || live.isUserMuted) ? 0 : v
            }
            if let live = self.entries[audioId] {
                live.node.volume = (self.isMuted || live.isUserMuted) ? 0 : end
            }
        }
        if var stored = entries[entry.audioId] {
            stored.fadeTasks.append(task)
            entries[entry.audioId] = stored
        }
    }

    // MARK: - host-time helpers

    private static let hostTimebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    /// Forward to `AudioMixer.hostTime(forDelaySeconds:)` so a single, hardened
    /// implementation (Double-based, clamped to `UInt64.max`, validates timebase
    /// and finiteness — see P3-#5 in commit `841a528a`) is the source of truth
    /// for the entire MeeshyUI audio pipeline. The previous local implementation
    /// silently overflowed on non-Apple-Silicon timebases (numer=1, denom=3 on
    /// Intel) for delays > 9.22s, which is well within the realistic envelope
    /// of a 30s slide. Production callers keep the same call shape; the dedicated
    /// `timebase:` overload below exists for tests that need to exercise the
    /// overflow path explicitly.
    static func hostTime(forDelaySeconds seconds: Double) -> UInt64 {
        return AudioMixer.hostTime(forDelaySeconds: seconds)
    }

    /// Testable overload that injects an explicit timebase. Delegates to the
    /// hardened `AudioMixer` helper so the two mixers stay bit-identical.
    static func hostTime(
        forDelaySeconds seconds: Double,
        timebase: mach_timebase_info_data_t
    ) -> UInt64 {
        return AudioMixer.hostTime(forDelaySeconds: seconds, timebase: timebase)
    }

    fileprivate static func delaySeconds(forHostTime target: UInt64, relativeTo now: UInt64) -> TimeInterval {
        guard target > now else { return 0 }
        let deltaTicks = target - now
        let nanos = deltaTicks * UInt64(hostTimebase.numer) / UInt64(hostTimebase.denom)
        return TimeInterval(nanos) / 1_000_000_000
    }

    // MARK: - Internal

    private struct Entry {
        let audioId: String
        let file: AVAudioFile
        let node: AVAudioPlayerNode
        let startTime: Float
        var targetVolume: Float
        let fadeIn: Float
        let fadeOut: Float
        let duration: Float
        let loop: Bool
        var fadeTimers: [Timer] = []
        var fadeTasks: [Task<Void, Never>] = []
        /// Mute per-piste déclenché par le tap utilisateur sur le chip du
        /// reader. Indépendant du mute global (`ReaderAudioMixer.isMuted`).
        var isUserMuted: Bool = false
    }

    /// Internal helper for the single background audio slot.
    private struct BackgroundEntry {
        let player: AVAudioPlayerNode
        let file: AVAudioFile
        let looping: Bool
        let audioId: String
        var targetVolume: Float
        let fadeIn: Float
        let fadeOut: Float
        /// Timeline offset (seconds) at which the entry begins.
        let startOffset: Double
        /// Playback duration (seconds) used to anchor an explicit fade-out.
        let duration: Float
        var fadeTimers: [Timer] = []
        var fadeTasks: [Task<Void, Never>] = []

        /// `true` when the composer authored an explicit fade — the default
        /// envelope must then defer to the configured values (RC4.7).
        var hasExplicitFade: Bool { fadeIn > 0 || fadeOut > 0 }
    }
}

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
        backgroundEntry = BackgroundEntry(
            player: player,
            file: file,
            looping: looping,
            audioId: audio.id,
            targetVolume: audio.volume,
            fadeIn: audio.fadeIn ?? 0,
            fadeOut: audio.fadeOut ?? 0,
            startOffset: startOffset,
            duration: resolvedDuration
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
    public func startBackground(originHost: UInt64) {
        guard let bg = backgroundEntry else { return }
        let scheduleAt = AVAudioTime(
            hostTime: originHost
                + ReaderAudioMixer.hostTime(forDelaySeconds: bg.startOffset)
        )
        scheduleBackgroundFile(at: scheduleAt)
        // Start silent when a fade-in (explicit or default) will ramp the
        // volume up; otherwise play straight at the target volume.
        bg.player.volume = isMuted ? 0 : (bg.fadeIn > 0 ? 0 : bg.targetVolume)
        bg.player.play()
        scheduleExplicitBackgroundFades(originHost: originHost)
    }

    /// Schedules the background file and, when `looping`, recursively re-arms
    /// the buffer on completion so the loop has no audible gap.
    private func scheduleBackgroundFile(at scheduleAt: AVAudioTime?) {
        guard let bg = backgroundEntry else { return }
        let completion: (@Sendable () -> Void)? = bg.looping ? { @Sendable [weak self] in
            // `_ =` : voir `scheduleFile(originHost:)` — discarde le handle du
            // `Task` pour que la closure retourne `Void`.
            _ = Task { @MainActor [weak self] in
                guard let self,
                      let live = self.backgroundEntry,
                      live.player.isPlaying else { return }
                self.scheduleBackgroundFile(at: nil)
            }
        } : nil
        bg.player.scheduleFile(bg.file, at: scheduleAt, completionHandler: completion)
    }

    /// Honours a composer-authored fade on the background entry. When an
    /// explicit fade exists the default envelope (`applyDefaultBackgroundEnvelope`)
    /// stays out of the way — the configuration prevails (RC4.7).
    private func scheduleExplicitBackgroundFades(originHost: UInt64) {
        guard let bg = backgroundEntry, bg.hasExplicitFade else { return }
        if bg.fadeIn > 0 {
            scheduleBackgroundVolumeFade(
                from: 0,
                to: bg.targetVolume,
                duration: TimeInterval(bg.fadeIn),
                triggerAt: originHost
                    + ReaderAudioMixer.hostTime(forDelaySeconds: bg.startOffset)
            )
        }
        if bg.fadeOut > 0 {
            let trigger = max(bg.startOffset,
                              bg.startOffset + Double(bg.duration) - Double(bg.fadeOut))
            scheduleBackgroundVolumeFade(
                from: bg.targetVolume,
                to: 0,
                duration: TimeInterval(bg.fadeOut),
                triggerAt: originHost
                    + ReaderAudioMixer.hostTime(forDelaySeconds: trigger)
            )
        }
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

// MARK: - PlaybackCoordinator integration

/// `ReaderAudioMixer` is a single-owner audio source: registering it with
/// `PlaybackCoordinator` lets a second reader surface (viewer + composer preview
/// mounted together) stop the previous engine before starting its own, so the
/// same background track is never heard from two engines at once (RC4.6).
extension ReaderAudioMixer: StoppablePlayer {}

// MARK: - Ducking + fade-out

extension ReaderAudioMixer {
    /// When `true`, foreground entry start/end events automatically schedule
    /// volume ramps on the background entry to duck and restore.
    public var duckingEnabled: Bool {
        get { _duckingEnabled }
        set { _duckingEnabled = newValue }
    }

    /// Volume the background drops to when ducking is active. Default 0.5.
    public var duckedBackgroundVolume: Float {
        get { _duckedBackgroundVolume }
        set { _duckedBackgroundVolume = newValue }
    }

    /// Globally fades all entries (foreground + background) to silence
    /// over `duration` seconds, then stops the engine. Idempotent.
    public func fadeOutAndStop(duration: TimeInterval = 0.5) async {
        guard isPlaying else { stop(); return }
        let steps = max(1, Int(duration * 50))   // 50 Hz ramp
        let stepDuration = duration / Double(steps)
        for s in 0..<steps {
            let factor = 1.0 - (Float(s + 1) / Float(steps))
            for (_, entry) in entries {
                entry.node.volume = entry.targetVolume * factor
            }
            if let bg = backgroundEntry {
                bg.player.volume = bg.player.volume * factor
            }
            try? await Task.sleep(nanoseconds: UInt64(stepDuration * 1_000_000_000))
        }
        stop()
    }
}
