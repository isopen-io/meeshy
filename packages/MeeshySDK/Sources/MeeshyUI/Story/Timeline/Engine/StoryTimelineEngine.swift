import Foundation
import AVFoundation
import os
#if canImport(UIKit)
import UIKit
#endif
import MeeshySDK

@MainActor
public final class StoryTimelineEngine {

    // MARK: Observable state
    public private(set) var currentTime: Float = 0
    public private(set) var isPlaying: Bool = false
    public private(set) var mode: TimelineEngineMode = .preview
    public var isMuted: Bool = false {
        didSet {
            player?.isMuted = isMuted
            audioMixer.setMute(isMuted)
        }
    }
    public var masterVolume: Float = 1.0 {
        didSet {
            let clamped = max(0, min(1, masterVolume))
            player?.volume = clamped
        }
    }

    // MARK: Callbacks
    public var onTimeUpdate: ((Float) -> Void)?
    public var onPlaybackEnd: (() -> Void)?
    public var onElementBecameActive: ((String) -> Void)?
    public var onError: ((Error) -> Void)?

    public var currentProjectSnapshot: TimelineProject? { currentProject }

    // MARK: Internals
    private let logger = Logger(subsystem: "me.meeshy.app", category: "media")
    private let audioMixer: AudioMixerProviding
    private var player: AVPlayer?
    private var playerItem: AVPlayerItem?
    private var composition: AVMutableComposition?
    private var videoComposition: AVMutableVideoComposition?
    private var timeObserver: Any?
    private var currentProject: TimelineProject?
    private var endObserver: NSObjectProtocol?
    // nonisolated(unsafe): read in deinit (off main thread safe — only written
    // from shutdown() which is @MainActor, deinit is the sole reader off-actor).
    private nonisolated(unsafe) var didShutdown: Bool = false

    public init(audioMixer: AudioMixerProviding? = nil) {
        self.audioMixer = audioMixer ?? AudioMixer()
    }

    // MARK: - Lifecycle

    /// Explicit teardown — releases AVPlayer, observers, and audio mixer. Must be
    /// called by the owner before deallocation. Idempotent.
    public func shutdown() {
        guard !didShutdown else { return }
        didShutdown = true
        tearDown()
    }

    deinit {
        // We CANNOT call MainActor-isolated tearDown() from deinit safely —
        // ARC may release the engine from any thread. The owner must call
        // shutdown() explicitly. In DEBUG we surface the contract violation
        // via a fatal precondition so it appears in crash logs and CI output.
        #if DEBUG
        precondition(
            didShutdown,
            "StoryTimelineEngine deinit without shutdown() — owner must call shutdown() before drop to release AVPlayer + observers safely."
        )
        #endif
    }

    // MARK: Mode switch (D6)

    public func setMode(_ newMode: TimelineEngineMode) {
        guard mode != newMode else { return }
        if newMode == .editing && isPlaying {
            pause()
        }
        mode = newMode
    }

    // MARK: Configure (D2 + D8 retry)

    #if canImport(UIKit)
    public func configure(
        project: TimelineProject,
        mediaURLs: [String: URL],
        images: [String: UIImage]
    ) async {
        await configureCore(project: project, mediaURLs: mediaURLs)
    }
    #else
    public func configure(
        project: TimelineProject,
        mediaURLs: [String: URL],
        images: [String: Any]
    ) async {
        await configureCore(project: project, mediaURLs: mediaURLs)
    }
    #endif

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            // Preview is read-only — use .playback (not .playAndRecord) so we
            // don't deactivate other apps' background audio. .mixWithOthers
            // lets the user keep listening to Apple Music while editing a story.
            // .moviePlayback is the canonical mode for video editor previews.
            try session.setCategory(
                .playback,
                mode: .moviePlayback,
                options: [.mixWithOthers]
            )
            try session.setPreferredIOBufferDuration(0.005)
            try session.setActive(true, options: [.notifyOthersOnDeactivation])
        } catch {
            logger.error("StoryTimelineEngine audio session setup failed: \(error.localizedDescription)")
        }
    }

    private func configureCore(
        project: TimelineProject,
        mediaURLs: [String: URL]
    ) async {
        await TimelineSignposter.intervalAsync("configure") {
            configureAudioSession()
            tearDown()
            currentProject = project

            let composition = AVMutableComposition()
            await insertVideoTracks(project: project, mediaURLs: mediaURLs, into: composition)
            let videoComposition = VideoCompositor.makeComposition(
                project: project,
                composition: composition
            )
            let item = AVPlayerItem(asset: composition)
            item.videoComposition = videoComposition
            let player = AVPlayer(playerItem: item)
            player.volume = max(0, min(1, masterVolume))
            player.isMuted = isMuted

            self.composition = composition
            self.videoComposition = videoComposition
            self.playerItem = item
            self.player = player

            attachTimeObserver()
            attachEndObserver()

            do {
                try audioMixer.configure(audios: project.audioPlayerObjects, urls: mediaURLs)
            } catch {
                logger.error("AudioMixer configure failed: \(error.localizedDescription)")
            }
            audioMixer.prepareAllNodes()
        }
    }

    private func insertVideoTracks(
        project: TimelineProject,
        mediaURLs: [String: URL],
        into composition: AVMutableComposition
    ) async {
        let videoClips = project.mediaObjects
            .filter { $0.kind == .video && $0.isBackground != true }
        for clip in videoClips {
            guard let url = mediaURLs[clip.id] else {
                logger.debug("StoryTimelineEngine skipping video \(clip.id) — no URL")
                continue
            }
            let source = TimelineMediaSource(id: clip.id, kind: .video, url: url)
            let asset: AVURLAsset
            do {
                asset = try await loadAssetWithRetry(source: source)
            } catch {
                logger.error("StoryTimelineEngine asset load failed for \(clip.id): \(error.localizedDescription)")
                onError?(StoryTimelineEngineError.assetLoadFailed(clipId: clip.id, reason: error.localizedDescription))
                continue
            }
            do {
                let tracks = try await asset.loadTracks(withMediaType: .video)
                guard let assetTrack = tracks.first else { continue }
                let compositionTrack = composition.addMutableTrack(
                    withMediaType: .video,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                )
                let start = CMTime(seconds: Double(clip.startTime ?? 0), preferredTimescale: 600)
                let duration = CMTime(seconds: Double(clip.duration ?? project.slideDuration), preferredTimescale: 600)
                let assetRange = CMTimeRange(start: .zero, duration: duration)
                try compositionTrack?.insertTimeRange(assetRange, of: assetTrack, at: start)
            } catch {
                logger.error("StoryTimelineEngine insertion failed for \(clip.id): \(error.localizedDescription)")
                onError?(StoryTimelineEngineError.assetLoadFailed(clipId: clip.id, reason: error.localizedDescription))
            }
        }
    }

    private func loadAssetWithRetry(source: TimelineMediaSource) async throws -> AVURLAsset {
        do {
            return try await source.loadAsset()
        } catch {
            try? await Task.sleep(nanoseconds: 500_000_000)
            return try await source.loadAsset()
        }
    }

    // MARK: Transport (D3)

    public func play() {
        guard player != nil, currentProject != nil else { return }
        player?.play()
        do {
            try audioMixer.play()
        } catch {
            // Audio failure is non-fatal — video still plays (silent).
            // Surface via onError so the composer can show a banner if needed.
            logger.error("AudioMixer play failed: \(error.localizedDescription)")
            onError?(StoryTimelineEngineError.audioEngineUnavailable(reason: error.localizedDescription))
        }
        isPlaying = true
    }

    public func pause() {
        player?.pause()
        audioMixer.pause()
        isPlaying = false
    }

    public func toggle() {
        if isPlaying { pause() } else { play() }
    }

    // MARK: Seek (D4)

    /// Seeks the player + audio mixer to the given absolute time.
    ///
    /// - Parameter time: Target playback time in seconds. Clamped to [0, slideDuration].
    /// - Parameter precise: When `true` (default), uses `.zero` tolerance for
    ///   frame-accurate seek (~100–500ms on H.264 GOPs). Callers performing
    ///   **continuous scrubbing** (e.g. drag gesture `.onChanged`) should pass
    ///   `precise: false` for sub-50ms response, then call once more with
    ///   `precise: true` on gesture `.onEnded` for the final frame-accurate seek.
    public func seek(to time: Float, precise: Bool = true) {
        TimelineSignposter.interval("seek") {
            guard let project = currentProject else { return }
            let clamped = max(0, min(project.slideDuration, time))
            currentTime = clamped
            if let player {
                let cmtime = CMTime(seconds: Double(clamped), preferredTimescale: 600)
                let tolerance: CMTime = precise ? .zero : CMTime(seconds: 0.05, preferredTimescale: 600)
                player.seek(to: cmtime, toleranceBefore: tolerance, toleranceAfter: tolerance)
            }
            audioMixer.seek(to: clamped)
            onTimeUpdate?(clamped)
        }
    }

    // MARK: Stop (D5)

    public func stop() {
        pause()
        seek(to: 0)
    }

    // MARK: Export stub (D7)

    public func export(
        to url: URL,
        preset: StoryTimelineExportPreset = .hd1080
    ) async throws {
        throw StoryTimelineExportError.notImplemented
    }

    // MARK: Lifecycle

    private func attachTimeObserver() {
        guard let player else { return }
        let interval = CMTime(value: 1, timescale: 60)
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: interval,
            queue: .main
        ) { [weak self] cmtime in
            guard let self else { return }
            let seconds = Float(CMTimeGetSeconds(cmtime))
            MainActor.assumeIsolated {
                self.currentTime = seconds
                self.onTimeUpdate?(seconds)
            }
        }
    }

    private func attachEndObserver() {
        guard let item = playerItem else { return }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            MainActor.assumeIsolated {
                self.isPlaying = false
                self.onPlaybackEnd?()
            }
        }
    }

    private func tearDown() {
        if let token = timeObserver {
            player?.removeTimeObserver(token)
            timeObserver = nil
        }
        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
            endObserver = nil
        }
        player?.pause()
        player = nil
        playerItem = nil
        videoComposition = nil
        composition = nil
        audioMixer.shutdown()
    }
}
