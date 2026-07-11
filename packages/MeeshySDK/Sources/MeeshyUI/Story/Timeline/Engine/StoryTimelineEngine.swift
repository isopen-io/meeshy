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

    // MARK: Internal drive clock (D0.1)
    //
    // Une slide SANS vidéo foreground (fond vidéo + textes/stickers — le cas
    // le plus courant) produit une AVMutableComposition VIDE : l'AVPlayer ne
    // progresse jamais et le transport est mort. Quand la composition n'a
    // aucune piste, la lecture est pilotée par ce timer main-thread qui
    // avance `currentTime` jusqu'à `slideDuration` (l'AudioMixer, moteur
    // séparé, joue en parallèle pour les slides audio-only).
    private var driveTimer: Timer?
    private var driveLastTimestamp: CFTimeInterval = 0

    private var usesInternalClock: Bool {
        composition?.tracks.isEmpty ?? true
    }

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
        // shutdown() explicitly to release AVPlayer + observers + audio mixer.
        // We log a warning when forgotten so the contract violation surfaces
        // in OS logs without crashing tests / production users (XCTest may
        // tear down test owners off the main thread; a hard precondition there
        // would mask the real assertion failures we care about).
        if !didShutdown {
            os.Logger(subsystem: "me.meeshy.app", category: "media").warning(
                "StoryTimelineEngine deinit without shutdown() — owner should call shutdown() before drop to release AVPlayer + observers. Falling back to ARC-driven cleanup of AVPlayer / AVAudioEngine; observer leaks are possible."
            )
        }
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
        // Call-safety : ne PAS reconfigurer la session pendant un appel VoIP
        // (sinon micro coupé) — l'aperçu éditeur cède sa session à l'appel.
        // État d'appel = source unique MediaSessionCoordinator.isCallActive.
        guard !MediaSessionCoordinator.shared.isCallActive else { return }
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

            // Composition vide (aucune vidéo foreground) → l'horloge interne
            // pilote le temps. Les observers AVPlayer ne doivent alors PAS
            // être attachés : sur un item vide, l'observer périodique peut
            // tirer un kCMTimeZero après un seek et écraser le currentTime
            // que l'horloge interne vient de poser (flake reproduit en CI).
            if !composition.tracks.isEmpty {
                attachTimeObserver()
                attachEndObserver()
            }

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
                let start = CMTime(seconds: clip.startTime ?? 0, preferredTimescale: 600)
                let duration = CMTime(seconds: clip.duration ?? Double(project.slideDuration), preferredTimescale: 600)
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
        guard player != nil, let project = currentProject else { return }
        if usesInternalClock {
            // Fin de slide déjà atteinte → replay depuis 0 (parité avec le
            // comportement AVPlayer où play() après end rejoue le dernier frame
            // sans repartir ; ici le transport interne repart proprement).
            if currentTime >= project.slideDuration { currentTime = 0 }
            startDriveClock()
        } else {
            player?.play()
        }
        do {
            try audioMixer.play()
        } catch {
            // Audio failure is non-fatal — video still plays (silent).
            // Surface via onError so the composer can show a banner if needed.
            logger.error("AudioMixer play failed: \(error.localizedDescription)")
            onError?(StoryTimelineEngineError.audioEngineUnavailable(reason: error.localizedDescription))
        }
        isPlaying = true
        NotificationCenter.default.post(
            name: .timelineDidStartPlaying,
            object: self,
            userInfo: ["slideId": project.slideId]
        )
    }

    public func pause() {
        stopDriveClock()
        player?.pause()
        audioMixer.pause()
        isPlaying = false
        NotificationCenter.default.post(name: .timelineDidStopPlaying, object: self)
    }

    private func startDriveClock() {
        stopDriveClock()
        driveLastTimestamp = CACurrentMediaTime()
        let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.driveClockTick() }
        }
        // .common : le timer continue de tirer pendant les gestes de scroll
        // de la sheet timeline (le mode default gèle pendant le tracking).
        RunLoop.main.add(timer, forMode: .common)
        driveTimer = timer
    }

    private func stopDriveClock() {
        driveTimer?.invalidate()
        driveTimer = nil
    }

    private func driveClockTick() {
        guard let project = currentProject else { stopDriveClock(); return }
        let now = CACurrentMediaTime()
        let dt = Float(now - driveLastTimestamp)
        driveLastTimestamp = now
        let next = min(project.slideDuration, currentTime + max(0, dt))
        currentTime = next
        onTimeUpdate?(next)
        if next >= project.slideDuration {
            stopDriveClock()
            audioMixer.pause()
            isPlaying = false
            NotificationCenter.default.post(name: .timelineDidStopPlaying, object: self)
            onPlaybackEnd?()
        }
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
            if let player, !usesInternalClock {
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
        stopDriveClock()
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
