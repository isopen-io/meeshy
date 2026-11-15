import Foundation
import MeeshySDK

/// Ce que le pilote d'« ensemble » commande : le vrai lecteur est `TogetherAVSurface` ; un double le remplace dans les
/// tests.
@MainActor
protocol TogetherPlayerSurface: AnyObject {
    var currentMs: Double { get }
    var isPaused: Bool { get }
    func seek(toMs: Double)
    /// Lit (ou continue de lire) à la vitesse donnée — 1 au nominal, ±5 % pour rattraper une dérive.
    func play(rate: Double)
    func pause()
}

/// LE LECTEUR SUIT LA SÉANCE, ET LA SÉANCE SUIT SES GESTES (#17097, iso `use-together-sync.ts`).
///
/// - Chaque état servi s'applique : position à l'horloge du serveur, lecture ou pause (`apply`). En lecture, la dérive
///   se rattrape à chaque battement (`tick`) : vitesse, puis saut.
/// - Un geste fait sur CE lecteur part chez l'autre s'il change l'état partagé (`TogetherSync.effect`) ; sinon il
///   réaligne seulement ce lecteur.
/// - Les commandes sont celles de l'app, jamais celles du système : rien de ce que le pilote provoque lui-même ne se
///   relit comme un geste.
@MainActor
final class TogetherPlaybackDriver {

    enum Gesture: Equatable {
        case play
        case pause
        case seek(toMs: Double)
    }

    private let surface: TogetherPlayerSurface
    private let now: () -> Date
    private let send: (_ playing: Bool, _ positionMs: Double) -> Void
    private var playback: TogetherPlayback?
    private var clockOffsetMs: Double = 0

    nonisolated deinit {}

    init(surface: TogetherPlayerSurface, now: @escaping () -> Date = { Date() }, send: @escaping (_ playing: Bool, _ positionMs: Double) -> Void) {
        self.surface = surface
        self.now = now
        self.send = send
    }

    /// La position où la séance EST maintenant, à l'horloge du serveur.
    var targetMs: Double? {
        playback.map { TogetherSync.servedPositionMs($0, serverNowMs: now().timeIntervalSince1970 * 1000 + clockOffsetMs) }
    }

    func apply(_ playback: TogetherPlayback, clockOffsetMs: Double) {
        self.playback = playback
        self.clockOffsetMs = clockOffsetMs
        align(seekOnly: false)
    }

    /// Le battement du rattrapage : en lecture seulement, et jamais pour relancer un lecteur arrêté.
    func tick() {
        guard playback?.playing == true, !surface.isPaused else { return }
        align(seekOnly: true)
    }

    func gesture(_ gesture: Gesture) {
        guard let playback, let target = targetMs else { return }
        let (local, kind, playing): (Double, TogetherSync.Gesture, Bool) = switch gesture {
        case .play: (surface.currentMs, .play, true)
        case .pause: (surface.currentMs, .pause, false)
        case .seek(let toMs): (toMs, .seek, playback.playing)
        }
        switch TogetherSync.effect(of: kind, localMs: local, targetMs: target, sharedPlaying: playback.playing) {
        case .send:
            perform(gesture)
            send(playing, local)
        case .align:
            align(seekOnly: false)
        }
    }

    private func perform(_ gesture: Gesture) {
        switch gesture {
        case .play: surface.play(rate: 1)
        case .pause: surface.pause()
        case .seek(let toMs): surface.seek(toMs: toMs)
        }
    }

    private func align(seekOnly: Bool) {
        guard let playback, let target = targetMs else { return }
        let correction = TogetherSync.correction(localMs: surface.currentMs, targetMs: target, playing: playback.playing)
        var rate = 1.0
        switch correction {
        case .seek(let toMs): surface.seek(toMs: toMs)
        case .rate(let nudged): rate = nudged
        case .none: break
        }
        if playback.playing {
            surface.play(rate: rate)
        } else if !seekOnly, !surface.isPaused {
            surface.pause()
        }
    }
}
