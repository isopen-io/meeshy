import Foundation
import AVFoundation
import QuartzCore
import Darwin
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
    /// Dernier clip signalé — sert à n'émettre que les CHANGEMENTS.
    private var lastActiveClipId: String?
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
    // aucune piste, la lecture est pilotée par ce `CADisplayLink` (calé sur
    // l'affichage, 120 Hz compris) qui DÉRIVE `currentTime` du temps hôte
    // écoulé depuis l'ancre commune avec l'audio (#9702) — un tick perdu ne
    // décale rien.
    private var driveLink: CADisplayLink?
    private var driveOrigin: (playhead: Float, anchorSeconds: CFTimeInterval)?

    /// Invalide les fins de seek dépassées par un seek, un play ou une pause
    /// postérieurs : seule la DERNIÈRE ré-ancre l'audio sur la vidéo.
    private var seekGeneration: UInt64 = 0

    /// Taille de tampon d'E/S de la session AVANT que l'aperçu ne pose la
    /// sienne, rendue au `shutdown()` (#9702).
    private var borrowedIOBufferDuration: TimeInterval?
    private static let previewIOBufferDuration: TimeInterval = 0.005

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
        restoreIOBufferDuration()
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
            // 5 ms : le scrub et le play du composer répondent sans latence
            // audible. Emprunté, jamais laissé : le reste de l'app (lecteur
            // de stories, vocaux) n'a pas à payer ce coût CPU/énergie.
            if borrowedIOBufferDuration == nil {
                borrowedIOBufferDuration = session.preferredIOBufferDuration
            }
            try session.setPreferredIOBufferDuration(Self.previewIOBufferDuration)
            try session.setActive(true, options: [.notifyOthersOnDeactivation])
        } catch {
            logger.error("StoryTimelineEngine audio session setup failed: \(error.localizedDescription)")
        }
    }

    /// Un appel en cours a posé SA configuration : on ne la réécrit pas.
    private func restoreIOBufferDuration() {
        guard let borrowed = borrowedIOBufferDuration else { return }
        borrowedIOBufferDuration = nil
        guard !MediaSessionCoordinator.shared.isCallActive else { return }
        do {
            try AVAudioSession.sharedInstance().setPreferredIOBufferDuration(borrowed)
        } catch {
            logger.error("StoryTimelineEngine IO buffer restore failed: \(error.localizedDescription)")
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
            // Composition LOCALE : attendre « pour minimiser les stalls »
            // retardait le départ vidéo d'une durée inconnue de l'audio, et
            // `setRate(_:time:atHostTime:)` l'exige (exception sinon).
            player.automaticallyWaitsToMinimizeStalling = false
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
        // Fin de slide déjà atteinte → replay depuis 0 (parité avec le
        // comportement AVPlayer où play() après end rejoue le dernier frame
        // sans repartir ; ici le transport interne repart proprement).
        if usesInternalClock, currentTime >= project.slideDuration { currentTime = 0 }
        startSynchronized()
        isPlaying = true
        NotificationCenter.default.post(
            name: .timelineDidStartPlaying,
            object: self,
            userInfo: ["slideId": project.slideId]
        )
    }

    public func pause() {
        seekGeneration &+= 1
        stopDriveClock()
        player?.pause()
        audioMixer.pause()
        isPlaying = false
        NotificationCenter.default.post(name: .timelineDidStopPlaying, object: self)
    }

    /// Démarre vidéo (ou horloge interne) ET audio à la MÊME ancre hôte, depuis
    /// la même position : celle du player quand il y a une vidéo (la position
    /// réellement affichée, pas le dernier tick observé), sinon `currentTime`.
    private func startSynchronized() {
        seekGeneration &+= 1
        let anchor = TimelinePlaybackSync.anchorHostTime()
        let playhead: Float
        if usesInternalClock {
            playhead = currentTime
            startDriveClock(from: playhead, anchorHostTime: anchor)
        } else if let player {
            let itemSeconds = player.currentTime().seconds
            playhead = itemSeconds.isFinite ? Float(itemSeconds) : currentTime
            startVideo(player, anchorHostTime: anchor)
        } else {
            return
        }
        do {
            try audioMixer.play(from: playhead, atHostTime: anchor)
        } catch {
            // Audio failure is non-fatal — video still plays (silent).
            // Surface via onError so the composer can show a banner if needed.
            logger.error("AudioMixer play failed: \(error.localizedDescription)")
            onError?(StoryTimelineEngineError.audioEngineUnavailable(reason: error.localizedDescription))
        }
    }

    /// `setRate(_:time:atHostTime:)` cale la première image sur l'ancre que
    /// l'audio partage. Un item pas encore prêt ne le supporte pas : il part
    /// au plus tôt (le player n'attend plus de tampon, cf. configure).
    private func startVideo(_ player: AVPlayer, anchorHostTime: UInt64) {
        guard player.currentItem?.status == .readyToPlay else {
            player.play()
            return
        }
        player.setRate(1,
                       time: .invalid,
                       atHostTime: CMClockMakeHostTimeFromSystemUnits(anchorHostTime))
    }

    private func startDriveClock(from playhead: Float, anchorHostTime: UInt64) {
        stopDriveClock()
        driveOrigin = (playhead, TimelinePlaybackSync.hostSeconds(anchorHostTime))
        let link = WeakDisplayLinkTarget.makeLink { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.driveClockTick(now: link.targetTimestamp)
        }
        // .common : le link continue de tirer pendant les gestes de scroll
        // de la sheet timeline (le mode default gèle pendant le tracking).
        link.add(to: .main, forMode: .common)
        driveLink = link
    }

    private func stopDriveClock() {
        driveLink?.invalidate()
        driveLink = nil
        driveOrigin = nil
    }

    /// Point de sortie UNIQUE de l'horloge : les trois sources de temps
    /// (horloge interne, seek, observateur AVPlayer) passent ici.
    ///
    /// `onElementBecameActive` n'était émis de NULLE PART — `TimelineViewModel`
    /// s'y abonnait pour faire suivre l'inspecteur au clip franchi, et
    /// n'entendait jamais rien. Le signal part d'ici, et UNIQUEMENT sur
    /// changement : le republier à chaque frame réécrirait la sélection 60
    /// fois par seconde et empêcherait l'utilisateur d'en choisir une autre
    /// pendant la lecture.
    private func publishTime(_ seconds: Float) {
        onTimeUpdate?(seconds)
        guard let project = currentProject else { return }
        let active = ActiveClipResolver.activeClipId(at: seconds, in: project)
        guard active != lastActiveClipId else { return }
        lastActiveClipId = active
        if let active { onElementBecameActive?(active) }
    }

    private func driveClockTick(now: CFTimeInterval) {
        guard let project = currentProject, let origin = driveOrigin else { stopDriveClock(); return }
        let next = TimelinePlaybackSync.internalClockPlayhead(origin: origin.playhead,
                                                              anchorSeconds: origin.anchorSeconds,
                                                              now: now,
                                                              duration: project.slideDuration)
        currentTime = next
        publishTime(next)
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
            seekGeneration &+= 1
            let generation = seekGeneration
            // En lecture, l'audio se tait pendant le seek : le replanifier tout
            // de suite le faisait partir AVANT que la vidéo n'ait rejoint sa
            // cible (le seek AVPlayer est asynchrone) — l'audio sautait devant.
            if isPlaying { audioMixer.pause() }
            audioMixer.seek(to: clamped)
            if let player, !usesInternalClock {
                let cmtime = CMTime(seconds: Double(clamped), preferredTimescale: 600)
                let tolerance: CMTime = precise ? .zero : CMTime(seconds: 0.05, preferredTimescale: 600)
                player.seek(to: cmtime, toleranceBefore: tolerance, toleranceAfter: tolerance) { [weak self] finished in
                    guard finished, let self else { return }
                    // La complétion d'AVPlayer arrive hors du MainActor.
                    Task { @MainActor in
                        self.seekDidComplete(generation: generation)
                    }
                }
            } else if isPlaying {
                startSynchronized()
            }
            publishTime(clamped)
        }
    }

    /// La vidéo a rejoint sa cible : vidéo et audio repartent ensemble, à la
    /// même ancre. Une fin de seek dépassée (seek, play ou pause plus récent)
    /// ne touche à rien.
    private func seekDidComplete(generation: UInt64) {
        guard generation == seekGeneration, isPlaying else { return }
        startSynchronized()
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
                self.publishTime(seconds)
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
                // Parité avec la fin de l'horloge interne : l'audio s'arrête
                // avec l'image, il ne continue pas seul après la fin.
                self.audioMixer.pause()
                self.isPlaying = false
                self.onPlaybackEnd?()
            }
        }
    }

    private func tearDown() {
        seekGeneration &+= 1
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
