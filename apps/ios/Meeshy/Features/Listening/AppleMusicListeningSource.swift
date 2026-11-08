import Combine
import MediaPlayer
import UIKit

/// CE QUI JOUE DANS APPLE MUSIC SUR CET iPHONE (#16803) — la seule source de l'écoute partagée sur iOS à ce jour.
///
/// - Lue par `MPMusicPlayerController.systemMusicPlayer`, après l'autorisation Médiathèque seulement : sans elle, la
///   source se tait (elle ne demande rien elle-même — c'est l'accord d'un partage qui la demande).
/// - Un morceau n'est rendu que s'il JOUE et qu'il a un titre ; la pause, l'arrêt et un titre vide rendent `nil`.
/// - Un message vocal Meeshy (`ConversationAudioCoordinator`) n'est JAMAIS une source : c'est le message privé d'un
///   tiers, dont l'expéditeur et la conversation ne quittent pas l'iPhone sous le nom d'une écoute.
/// - Spotify, YouTube, Netflix : hors d'atteinte d'une app tierce sur iOS (ou après connexion d'un compte, hors lot).
@MainActor
final class AppleMusicListeningSource {

    private let player: MPMusicPlayerController
    private let authorized: () -> Bool
    private var observing = false

    nonisolated deinit {}

    init(
        player: MPMusicPlayerController = .systemMusicPlayer,
        authorized: @escaping () -> Bool = { MPMediaLibrary.authorizationStatus() == .authorized }
    ) {
        self.player = player
        self.authorized = authorized
    }

    /// Le morceau courant, puis chacun de ses changements (morceau, pause, retour au premier plan).
    var tracks: AnyPublisher<ListeningTrack?, Never> {
        let center = NotificationCenter.default
        let changes = Publishers.MergeMany(
            center.publisher(for: .MPMusicPlayerControllerNowPlayingItemDidChange, object: player),
            center.publisher(for: .MPMusicPlayerControllerPlaybackStateDidChange, object: player),
            center.publisher(for: UIApplication.didBecomeActiveNotification)
        )
        .map { _ in () }
        return changes
            .prepend(())
            .receive(on: DispatchQueue.main)
            .map { [weak self] _ in self?.current() }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    /// Les notifications du lecteur ne s'allument qu'une fois l'autorisation donnée — y compris quand elle l'est
    /// pendant que l'app tourne (le retour au premier plan après la demande relit la source).
    private func current() -> ListeningTrack? {
        guard authorized() else { return nil }
        if !observing {
            observing = true
            player.beginGeneratingPlaybackNotifications()
        }
        guard player.playbackState == .playing, let item = player.nowPlayingItem else { return nil }
        return Self.track(title: item.title, artist: item.artist)
    }

    nonisolated static func track(title: String?, artist: String?) -> ListeningTrack? {
        guard let title = title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else { return nil }
        let artist = artist?.trimmingCharacters(in: .whitespacesAndNewlines)
        return ListeningTrack(title: title, artist: artist?.isEmpty == false ? artist : nil)
    }
}
