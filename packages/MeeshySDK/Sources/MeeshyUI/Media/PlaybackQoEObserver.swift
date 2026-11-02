import AVFoundation
import Combine
import QuartzCore
import MeeshySDK

// MARK: - La qualité d'une lecture de contenu SOCIAL, un résumé par session (#10504)

/// Ce que la surface déclare de la lecture qu'elle lance : le contenu (post,
/// réel) et sa surface. Sans sujet déclaré — une vidéo de conversation, par
/// exemple —, aucune mesure n'est prise : la QoE d'un contenu social seulement.
public struct PlaybackQoESubject: Sendable, Equatable {
    public let target: SocialTarget
    public let surface: SocialSurface?
    public let mediaId: String
    public let mediaDurationMs: Int?

    public init(target: SocialTarget, surface: SocialSurface?, mediaId: String, mediaDurationMs: Int? = nil) {
        self.target = target
        self.surface = surface
        self.mediaId = mediaId
        self.mediaDurationMs = mediaDurationMs
    }
}

/// Branché sur `AVPlayer` / `AVPlayerItem` par KVO et par les notifications
/// du système — aucune minuterie, aucun travail par image. Il ne fait
/// qu'additionner dans un `PlaybackQoEAccumulator` ; `finish` rend l'UNIQUE
/// événement `playback` de la session.
@MainActor
public final class PlaybackQoEObserver {
    nonisolated deinit {}

    public let subject: PlaybackQoESubject
    private let clockMs: @MainActor () -> Int
    private let startedAtMs: Int
    private var accumulator: PlaybackQoEAccumulator
    private var cancellables = Set<AnyCancellable>()
    private weak var player: AVPlayer?
    private var lastIndicatedBitrate: Double?
    private var finished = false
    private var firstFrameFromComposition = false

    public init(
        subject: PlaybackQoESubject,
        player: AVPlayer,
        mutedAtStart: Bool,
        deviceTier: PlaybackDeviceTier? = DeviceMediaTier.current.playbackTier,
        startedAtMs: Int? = nil,
        clockMs: @escaping @MainActor () -> Int = { Int(CACurrentMediaTime() * 1_000) }
    ) {
        self.subject = subject
        self.clockMs = clockMs
        self.startedAtMs = startedAtMs ?? clockMs()
        self.player = player
        self.accumulator = PlaybackQoEAccumulator(mediaId: subject.mediaId, mediaDurationMs: subject.mediaDurationMs, mutedAtStart: mutedAtStart, deviceTier: deviceTier)
        attach(to: player)
    }

    private var nowMs: Int { clockMs() - startedAtMs }

    /// Même forme que `SharedAVPlayerManager.setupObservers` : chaque flux
    /// repasse sur le fil principal AVANT tout traitement — un rappel KVO ou
    /// une notification arrive sur le fil qui a changé la valeur.
    private func attach(to player: AVPlayer) {
        player.publisher(for: \.timeControlStatus)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in self?.noteTimeControl(status) }
            .store(in: &cancellables)
        // Un `AVQueuePlayer` bouclé (fond de story) expose `currentItem == nil`
        // quelques tours de boucle après l'attache : les observateurs d'item
        // se posent alors à l'arrivée du premier élément, jamais perdus.
        if let item = player.currentItem {
            attachItemObservers(item)
            return
        }
        player.publisher(for: \.currentItem, options: [.new])
            .compactMap { $0 }
            .first()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] item in self?.attachItemObservers(item) }
            .store(in: &cancellables)
    }

    private func attachItemObservers(_ item: AVPlayerItem) {
        let asset = item.asset
        item.publisher(for: \.isPlaybackBufferEmpty)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] empty in if empty { self?.noteBufferEmpty() } }
            .store(in: &cancellables)
        item.publisher(for: \.isPlaybackLikelyToKeepUp)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] keepsUp in if keepsUp { self?.noteLikelyToKeepUp() } }
            .store(in: &cancellables)
        // La boucle d'un réel enchaîne des ÉLÉMENTS successeurs sur le même
        // actif (`AVQueuePlayer`) : on reconnaît la session à son actif.
        let center = NotificationCenter.default
        center.publisher(for: AVPlayerItem.newAccessLogEntryNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] note in
                guard let played = note.object as? AVPlayerItem, played.asset === asset,
                      let event = played.accessLog()?.events.last else { return }
                self?.noteAccessLog(observedBitrate: event.observedBitrate, indicatedBitrate: event.indicatedBitrate)
            }
            .store(in: &cancellables)
        center.publisher(for: AVPlayerItem.failedToPlayToEndTimeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] note in
                guard let played = note.object as? AVPlayerItem, played.asset === asset,
                      let error = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? NSError else { return }
                self?.accumulator.noteError(code: error.code, domain: error.domain)
            }
            .store(in: &cancellables)
        center.publisher(for: AVPlayerItem.didPlayToEndTimeNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] note in
                guard let played = note.object as? AVPlayerItem, played.asset === asset else { return }
                self?.accumulator.noteLoop()
            }
            .store(in: &cancellables)
    }

    /// **La première image COMPOSÉE** (#11287) — `AVPlayerLayer.isReadyForDisplay`,
    /// le seul signal qui dit « l'utilisateur voit une image », là où
    /// `timeControlStatus == .playing` n'arrive qu'au GO de la lecture. La
    /// première image gagne. Une fois armée, elle est la SEULE source de la
    /// première image : un `.playing` arrivé avant la composition ne la
    /// devance pas. `readiness` est livrée sur le fil principal.
    public func observeFirstFrame(readiness: AnyPublisher<Bool, Never>) {
        firstFrameFromComposition = true
        readiness
            .filter { $0 }
            .first()
            .sink { [weak self] _ in self?.noteFirstFrameComposed() }
            .store(in: &cancellables)
    }

    public func observeFirstFrame(of layer: AVPlayerLayer) {
        observeFirstFrame(readiness: layer.publisher(for: \.isReadyForDisplay)
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher())
    }

    public func noteFirstFrameComposed() { accumulator.noteFirstFrame(atMs: nowMs) }

    private func noteBufferEmpty() { accumulator.noteBufferEmpty(atMs: nowMs) }
    private func noteLikelyToKeepUp() { accumulator.noteLikelyToKeepUp(atMs: nowMs) }

    func noteTimeControl(_ status: AVPlayer.TimeControlStatus) {
        switch status {
        case .playing:
            if !firstFrameFromComposition { accumulator.noteFirstFrame(atMs: nowMs) }
            accumulator.notePlaying(atMs: nowMs)
        case .paused:
            accumulator.notePaused(atMs: nowMs)
        default:
            break
        }
    }

    private func noteAccessLog(observedBitrate: Double, indicatedBitrate: Double) {
        let changed = lastIndicatedBitrate.map { $0 != indicatedBitrate && indicatedBitrate > 0 } ?? false
        if indicatedBitrate > 0 { lastIndicatedBitrate = indicatedBitrate }
        accumulator.noteAccessLog(observedBitrateKbps: observedBitrate > 0 ? Int(observedBitrate / 1_000) : nil, renditionChanged: changed)
    }

    public func noteSeek() { accumulator.noteSeek() }
    public func noteMuteToggled() { accumulator.noteMuteToggled() }

    /// La fin de la session : un seul événement, puis plus rien.
    public func finish(reason: PlaybackSummary.ExitReason) -> SocialEventV2? {
        guard !finished else { return nil }
        finished = true
        if let duration = player?.currentItem?.duration, duration.isNumeric {
            accumulator.noteDuration(ms: Int(duration.seconds * 1_000))
        }
        if let player, player.currentTime().isNumeric {
            accumulator.notePosition(ms: Int(player.currentTime().seconds * 1_000))
        }
        cancellables.removeAll()
        let summary = accumulator.finish(atMs: nowMs, reason: reason)
        return SocialEventV2(target: subject.target, surface: subject.surface, payload: .playback(summary))
    }
}
