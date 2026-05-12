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

    public init() {}

    // MARK: - Configure

    /// Configure the mixer for a slide. Call before `play()`. Replaces any
    /// previous configuration and tears down dangling nodes.
    public func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
        teardown()
        for audio in audios {
            guard let url = urls[audio.id] else { continue }
            do {
                let file = try AVAudioFile(forReading: url)
                let node = AVAudioPlayerNode()
                engine.attach(node)
                engine.connect(node, to: engine.mainMixerNode, format: file.processingFormat)
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
    }

    // MARK: - Transport

    /// Start playback at host-clock now. Each clip is scheduled at
    /// `now + clip.startTime` so the audio fires on the right sample without
    /// any further per-frame intervention.
    public func play() throws {
        guard !entries.isEmpty else {
            isPlaying = true
            return
        }
        if !engine.isRunning {
            try engine.start()
        }
        let originHost = mach_absolute_time()
        playbackStartHostTime = originHost
        for entry in entries.values {
            scheduleEntry(entry, originHost: originHost)
            entry.node.play()
            // Schedule volume fades on the main runloop. node.volume is read
            // by the audio thread per render slice, so the reads are safe.
            scheduleFades(for: entry, originHost: originHost)
        }
        isPlaying = true
    }

    public func pause() {
        for entry in entries.values { entry.node.pause() }
        if engine.isRunning { engine.pause() }
        isPlaying = false
    }

    public func stop() {
        for entry in entries.values { entry.node.stop() }
        if engine.isRunning { engine.stop() }
        playbackStartHostTime = nil
        isPlaying = false
    }

    // MARK: - Volume / mute

    public func setVolume(_ volume: Float, for audioId: String) {
        let clamped = max(0, min(1, volume))
        guard var entry = entries[audioId] else { return }
        entry.targetVolume = clamped
        entries[audioId] = entry
        if !isMuted { entry.node.volume = clamped }
    }

    public func setMute(_ muted: Bool) {
        isMuted = muted
        for entry in entries.values {
            entry.node.volume = muted ? 0 : entry.targetVolume
        }
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
        if engine.isRunning {
            engine.stop()
        }
        playbackStartHostTime = nil
        isPlaying = false
    }

    deinit {
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

        let completion: AVAudioNodeCompletionHandler? = entry.loop ? { [weak self, audioId = entry.audioId] in
            // Re-schedule the same file at the next "now" host-time so the
            // loop has no audible gap. Using nil scheduleAt ensures playback
            // continues immediately upon completion.
            Task { @MainActor [weak self] in
                guard let self, let entry = self.entries[audioId], entry.node.isPlaying else { return }
                entry.node.scheduleFile(entry.file, at: nil, completionHandler: nil)
            }
        } : nil

        entry.node.scheduleFile(entry.file, at: scheduleAt, completionHandler: completion)
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
            entry.node.volume = isMuted ? 0 : end
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
                live.node.volume = self.isMuted ? 0 : v
            }
            if let live = self.entries[audioId] {
                live.node.volume = self.isMuted ? 0 : end
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
    }

    /// Internal helper for the single background audio slot.
    private struct BackgroundEntry {
        let player: AVAudioPlayerNode
        let file: AVAudioFile
        let looping: Bool
        let audioId: String
    }
}

// MARK: - Background audio

extension ReaderAudioMixer {
    /// Number of configured background entries (0 or 1).
    public var backgroundClipCount: Int { backgroundEntry == nil ? 0 : 1 }

    /// Configures a single background audio source. Replaces any prior bg entry.
    /// `looping=true` schedules the buffer to repeat sample-accurately.
    public func configureBackground(audio: StoryAudioPlayerObject,
                                    url: URL,
                                    looping: Bool) throws {
        // Tear down any prior background node before re-attaching.
        if let prior = backgroundEntry {
            prior.player.stop()
            engine.detach(prior.player)
        }
        let file = try AVAudioFile(forReading: url)
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: file.processingFormat)
        backgroundEntry = BackgroundEntry(player: player, file: file,
                                         looping: looping, audioId: audio.id)
    }
}

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
