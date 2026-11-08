import Foundation
import MeeshySDK

/// Un morceau qui JOUE sur cet iPhone, tel que la source l'a lu. Rien d'autre n'en sort : ni l'album, ni la durée,
/// ni la position de lecture.
struct ListeningTrack: Equatable, Sendable {
    let title: String
    let artist: String?
}

/// Ce que l'émetteur doit faire, et rien de plus : la loi ne voit jamais la socket.
enum ListeningBroadcastAction: Equatable, Sendable {
    case none
    case publish(NowPlayingUpdate)
    case clear
}

/// LA LOI DE L'ÉMISSION DE MON ÉCOUTE (#16803, sous-lot `proche-sang-ecoute@ios` de #13934) — pure, sans horloge ni
/// socket : on lui donne ce qui se passe, elle rend ce qui part.
///
/// - Rien ne part sans le choix de l'utilisateur (`enabled`) : un morceau lu avant ce choix ne quitte pas l'iPhone.
/// - L'état part COMPLET, une fois par changement : le serveur le tronque lecteur par lecteur (décision du porteur,
///   spec cercles § 1.5). Le même morceau n'est renvoyé qu'au rafraîchissement (`NOW_PLAYING_REFRESH_SECONDS`), pour que
///   l'état serveur (15 min de vie) ne s'éteigne pas pendant une longue écoute.
/// - La pause, la fin, le passage en arrière-plan (on n'y observe plus la lecture : rien n'est affirmé qu'on ne
///   peut plus voir) et le retrait du choix effacent l'état serveur — une fois, seulement s'il existe.
/// - Un envoi perdu (hors ligne, débit) se rejoue au prochain pas ; un envoi REFUSÉ ne se rejoue pas avant le
///   prochain changement ou le prochain rafraîchissement.
struct ListeningBroadcastLaw: Equatable, Sendable {

    static let refreshInterval: TimeInterval = 600
    static let appleMusicSource = "Apple Music"

    private(set) var enabled = false
    private(set) var visible = true
    private(set) var playing: ListeningTrack?
    private(set) var held: NowPlayingUpdate?
    private(set) var heldAt: Date?

    var desired: NowPlayingUpdate? {
        guard enabled, visible, let playing else { return nil }
        return Self.update(for: playing)
    }

    static func update(for track: ListeningTrack) -> NowPlayingUpdate {
        let title = track.artist.map { "\(track.title) — \($0)" } ?? track.title
        return NowPlayingUpdate(category: .music, title: title, source: appleMusicSource)
    }

    mutating func setEnabled(_ next: Bool, now: Date) -> ListeningBroadcastAction {
        enabled = next
        return step(now: now)
    }

    mutating func setVisible(_ next: Bool, now: Date) -> ListeningBroadcastAction {
        visible = next
        return step(now: now)
    }

    mutating func play(_ track: ListeningTrack?, now: Date) -> ListeningBroadcastAction {
        playing = track
        return step(now: now)
    }

    /// Le battement : rafraîchir une longue écoute, rejouer un envoi perdu.
    mutating func tick(now: Date) -> ListeningBroadcastAction {
        step(now: now)
    }

    /// Une socket fraîchement accrochée : ce qui joue repart, l'état serveur a pu s'éteindre pendant la coupure.
    mutating func reconnected(now: Date) -> ListeningBroadcastAction {
        guard desired != nil else { return .none }
        heldAt = nil
        return step(now: now)
    }

    /// L'accusé d'un envoi, pour l'état ENCORE voulu. Un envoi perdu reste tenu pour possiblement gardé (la pause
    /// l'effacera quand même) mais périmé : le prochain pas le rejoue.
    mutating func settle(_ update: NowPlayingUpdate, _ outcome: NowPlayingPublishOutcome) {
        guard held == update else { return }
        switch outcome {
        case .accepted, .refused:
            return
        case .offline, .rateLimited:
            heldAt = nil
        }
    }

    private mutating func step(now: Date) -> ListeningBroadcastAction {
        guard let desired else {
            guard held != nil else { return .none }
            held = nil
            heldAt = nil
            return .clear
        }
        let stale = heldAt.map { now.timeIntervalSince($0) >= Self.refreshInterval } ?? true
        guard held != desired || stale else { return .none }
        held = desired
        heldAt = now
        return .publish(desired)
    }
}
