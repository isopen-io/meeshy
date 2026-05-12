import Foundation
import AVFoundation
import os
import MeeshySDK

@MainActor
public protocol AudioMixerProviding: AnyObject {
    var isMuted: Bool { get set }
    var maxActiveNodes: Int { get }
    func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws
    func play() throws
    func pause()
    func seek(to time: Float)
    func setVolume(_ volume: Float, for audioId: String)
    func setMute(_ muted: Bool)
    func teardown()
    func shutdown()
    func prepareAllNodes()
}

@MainActor
public final class AudioMixer: AudioMixerProviding {

    public private(set) var maxActiveNodes: Int
    public var isMuted: Bool = false { didSet { applyMute() } }
    public private(set) var lastSeekTime: Float = 0
    public var isPlaying: Bool { _isPlayingStorage }
    public var activeNodeCount: Int { nodes.count }
    public func intendedVolume(for audioId: String) -> Float? { volumes[audioId] }

    private let logger = Logger(subsystem: "me.meeshy.app", category: "media")
    private let engine = AVAudioEngine()
    private var nodes: [String: AVAudioPlayerNode] = [:]
    private var files: [String: AVAudioFile] = [:]
    private var volumes: [String: Float] = [:]
    /// Timeline `startTime` per audio (seconds from t=0). Used by play()/seek()
    /// to compute sample-accurate `AVAudioTime(hostTime:)` schedules so the
    /// audio fires at exactly its timeline position, not at engine-start time.
    /// Without this, every audio clip plays from t=0 regardless of when it's
    /// supposed to come in — the bug surfaced when authoring multi-clip slides.
    private var startTimes: [String: Float] = [:]
    private var _isPlayingStorage: Bool = false
    private var didShutdown: Bool = false

    public init(maxActiveNodes: Int = 6) {
        self.maxActiveNodes = maxActiveNodes
    }

    // MARK: - Lifecycle

    /// Explicit teardown — stops all nodes, detaches from engine, releases resources.
    /// Must be called by the owner before deallocation. Idempotent.
    public func shutdown() {
        guard !didShutdown else { return }
        didShutdown = true
        teardown()
    }

    public func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
        teardown()
        var attached = 0
        for audio in audios {
            volumes[audio.id] = max(0, min(1, audio.volume))
            startTimes[audio.id] = audio.startTime ?? 0
            guard attached < maxActiveNodes else {
                logger.info("AudioMixer cap reached at \(self.maxActiveNodes), skipping audio \(audio.id)")
                continue
            }
            guard let url = urls[audio.id] else {
                logger.debug("AudioMixer skipping \(audio.id) — no URL")
                continue
            }
            do {
                let file = try AVAudioFile(forReading: url)
                let node = AVAudioPlayerNode()
                engine.attach(node)
                engine.connect(node, to: engine.mainMixerNode, format: file.processingFormat)
                node.volume = isMuted ? 0 : (volumes[audio.id] ?? 1)
                nodes[audio.id] = node
                files[audio.id] = file
                attached += 1
            } catch {
                logger.error("AudioMixer failed to load \(audio.id): \(error.localizedDescription)")
            }
        }
    }

    public func play() throws {
        guard !nodes.isEmpty else {
            _isPlayingStorage = true
            return
        }
        // Try to start engine BEFORE flipping _isPlayingStorage. If start fails,
        // we must NOT lie about playback state.
        if !engine.isRunning {
            do {
                try engine.start()
            } catch {
                logger.error("AudioMixer.start() failed: \(error.localizedDescription)")
                _isPlayingStorage = false
                throw error
            }
        }
        let timelineStart = lastSeekTime
        for (id, node) in nodes {
            guard let file = files[id] else { continue }
            scheduleNodeFromTimelineTime(audioId: id, node: node, file: file, time: timelineStart)
            node.play()
        }
        _isPlayingStorage = true
    }

    /// Sample-accurate scheduling: places the file at the exact host-time the
    /// timeline says it should start, derived from `clip.startTime` minus
    /// `currentTimelineTime`. Falls back to immediate scheduling at a file
    /// offset when the timeline already passed `startTime` (mid-flight seek).
    ///
    /// Why hostTime rather than sampleTime: per Apple Core Audio guidance,
    /// `AVAudioTime(sampleTime:atRate:)` is unreliable across nodes (input vs
    /// output may report different timestamps), whereas `hostTime` resolves
    /// from `mach_absolute_time()` and is consistent for every node connected
    /// to the same engine. This is the canonical pattern Apple ships in their
    /// AVAEMixerSample sample code.
    private func scheduleNodeFromTimelineTime(
        audioId: String,
        node: AVAudioPlayerNode,
        file: AVAudioFile,
        time timelineTime: Float
    ) {
        let startTime = startTimes[audioId] ?? 0
        let sampleRate = file.processingFormat.sampleRate
        let totalFrames = file.length

        if timelineTime < startTime {
            // Future schedule. Translate the (startTime - timelineTime)
            // delay into mach host ticks and pin the file at that hostTime.
            let delaySeconds = Double(startTime - timelineTime)
            let hostDelay = AudioMixer.hostTime(forDelaySeconds: delaySeconds)
            let scheduleAt = AVAudioTime(hostTime: mach_absolute_time() + hostDelay)
            node.scheduleFile(file, at: scheduleAt, completionHandler: nil)
        } else {
            // Already past startTime — schedule immediate playback from a
            // file offset so the audio is positionally correct.
            let offset = Double(timelineTime - startTime)
            let startFrame = AVAudioFramePosition(offset * sampleRate)
            guard startFrame < totalFrames else { return }
            let remaining = AVAudioFrameCount(totalFrames - startFrame)
            node.scheduleSegment(file,
                                 startingFrame: startFrame,
                                 frameCount: remaining,
                                 at: nil,
                                 completionHandler: nil)
        }
    }

    /// Convert a wall-clock delay in seconds to the `mach_absolute_time()`
    /// host-tick delta required by `AVAudioTime(hostTime:)`. Cached
    /// `mach_timebase_info` so we don't pay the syscall on every schedule.
    private static let hostTimebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    /// Production entry point — uses the cached system timebase.
    static func hostTime(forDelaySeconds seconds: Double) -> UInt64 {
        return hostTime(forDelaySeconds: seconds, timebase: hostTimebase)
    }

    /// Pure helper used by the production path and by tests. Computes
    /// `nanos * denom / numer` in `Double` to avoid silent `UInt64` overflow
    /// on non-Apple-Silicon timebases (e.g. Intel reports numer=1, denom=3,
    /// which triples the nanosecond product before the divide). The Double
    /// representation has 53 bits of mantissa, plenty for any realistic
    /// wall-clock delay (centuries), and the final value is clamped to the
    /// `UInt64` range before truncation so a malformed input can never wrap
    /// around to a tiny number and miss-schedule audio in the past.
    static func hostTime(
        forDelaySeconds seconds: Double,
        timebase: mach_timebase_info_data_t
    ) -> UInt64 {
        guard seconds > 0,
              seconds.isFinite,
              timebase.numer > 0,
              timebase.denom > 0 else {
            return 0
        }
        let nanosDouble = seconds * 1_000_000_000.0
        let hostUnitsDouble = nanosDouble * Double(timebase.denom) / Double(timebase.numer)
        let clamped = min(max(0, hostUnitsDouble), Double(UInt64.max))
        return UInt64(clamped)
    }

    public func pause() {
        for node in nodes.values { node.pause() }
        if engine.isRunning { engine.pause() }
        _isPlayingStorage = false
    }

    public func seek(to time: Float) {
        let clamped = max(0, time)
        lastSeekTime = clamped
        let wasPlaying = _isPlayingStorage
        // ALWAYS stop nodes before re-scheduling, even when paused, to avoid
        // doubling the buffered segment if the caller seeks twice in a row
        // without a play() in between.
        for node in nodes.values { node.stop() }
        for (id, node) in nodes {
            guard let file = files[id] else { continue }
            scheduleNodeFromTimelineTime(audioId: id, node: node, file: file, time: clamped)
        }
        if wasPlaying {
            for node in nodes.values { node.play() }
        }
    }

    public func setVolume(_ volume: Float, for audioId: String) {
        let clamped = max(0, min(1, volume))
        volumes[audioId] = clamped
        nodes[audioId]?.volume = isMuted ? 0 : clamped
    }

    public func setMute(_ muted: Bool) {
        isMuted = muted
    }

    public func teardown() {
        nodes.values.forEach { $0.stop() }
        nodes.removeAll()
        files.removeAll()
        volumes.removeAll()
        startTimes.removeAll()
        if engine.isRunning {
            engine.stop()
        }
        _isPlayingStorage = false
    }

    public func prepareAllNodes() {
        for node in nodes.values {
            node.prepare(withFrameCount: 4096)
        }
    }

    private func applyMute() {
        for (id, node) in nodes {
            node.volume = isMuted ? 0 : (volumes[id] ?? 1)
        }
    }

    deinit {
        // We CANNOT call MainActor-isolated teardown() from deinit safely —
        // ARC may release AudioMixer from any thread. The owner should call
        // shutdown() explicitly. We log a warning when forgotten; ARC will
        // still release AVAudioEngine + nodes (Foundation classes have their
        // own teardown), so this is a leak hint, not a crash.
        if !didShutdown {
            os.Logger(subsystem: "me.meeshy.app", category: "media").warning(
                "AudioMixer deinit without shutdown() — owner should call shutdown() before drop to release AVAudioEngine + nodes deterministically."
            )
        }
    }
}
