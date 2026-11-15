import AVFoundation
import QuartzCore
import MeeshySDK

/// **La qualité de lecture du fond vidéo d'une story (#11287)** — la même
/// méthode que les réels (`PlaybackQoEObserver`, un résumé par session), avec
/// le temps-à-première-image pris sur `AVPlayerLayer.isReadyForDisplay`, la
/// première image réellement composée, et non sur le GO de la lecture.
///
/// Une session par player : `begin` est idempotent pour un même player, et un
/// player nouveau ferme l'ancien (`swiped`). Sans cible déclarée — aperçu du
/// composer, calque sortant d'un fondu —, rien n'est mesuré. `finish` rend
/// l'UNIQUE événement `playback` de la session au hub des événements v2.
///
/// Le périmètre est le fond vidéo ; les vidéos de premier plan n'ont pas de
/// session (suite de #11287).
@MainActor
public final class StoryBackgroundPlaybackQoE {
    nonisolated deinit {}

    /// La story lue, déclarée par l'hôte qui la connaît. `nil` : rien n'est mesuré.
    public var target: SocialTarget?

    private let emit: @MainActor (SocialEventV2) -> Void
    private let clockMs: @MainActor () -> Int
    private var waitingSinceMs: Int?
    private var observer: PlaybackQoEObserver?
    private weak var observedPlayer: AVPlayer?

    public nonisolated init(
        emit: @escaping @MainActor (SocialEventV2) -> Void = { SocialEventsV2Hub.shared.emit($0) },
        clockMs: @escaping @MainActor () -> Int = { Int(CACurrentMediaTime() * 1_000) }
    ) {
        self.emit = emit
        self.clockMs = clockMs
    }

    /// Le canvas commence à ATTENDRE sa première image. En cache froid le
    /// player n'existe pas encore (le téléchargement précède l'attache) : sans
    /// cette borne, le temps-à-première-image ne compterait que la fin de
    /// l'attente. La première attente gagne, tant qu'aucune session ne court.
    public func markWaiting() {
        guard observer == nil, waitingSinceMs == nil, target != nil else { return }
        waitingSinceMs = clockMs()
    }

    public var isRunning: Bool { observer != nil }

    public func begin(
        player: AVPlayer,
        layer: AVPlayerLayer,
        mediaId: String,
        mutedAtStart: Bool,
        deviceTier: PlaybackDeviceTier? = DeviceMediaTier.current.playbackTier
    ) {
        guard let target else { return }
        if observer != nil, observedPlayer === player { return }
        let startedAtMs = waitingSinceMs
        finish(reason: .swiped)
        let subject = PlaybackQoESubject(target: target, surface: SocialSurface(.story), mediaId: mediaId)
        let created = PlaybackQoEObserver(subject: subject, player: player, mutedAtStart: mutedAtStart, deviceTier: deviceTier, startedAtMs: startedAtMs, clockMs: clockMs)
        created.observeFirstFrame(of: layer)
        observer = created
        observedPlayer = player
    }

    public func finish(reason: PlaybackSummary.ExitReason) {
        waitingSinceMs = nil
        guard let current = observer else { return }
        observer = nil
        observedPlayer = nil
        if let event = current.finish(reason: reason) { emit(event) }
    }
}
