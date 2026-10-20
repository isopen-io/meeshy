import AVFoundation
import Combine

// MARK: - Appliquer la loi d'activation des pistes (#11282)

/// **Pose `AudioTrackActivationLaw` sur un lecteur** : le drapeau de sortie et
/// les pistes audio de chaque élément de sa file, au démarrage, à chaque
/// bascule de mute et à l'instant où un élément (le successeur d'une boucle
/// compris) devient prêt. Une brique à paramètres opaques : la surface dit si
/// elle est muette, le SDK n'en sait rien d'autre.
@MainActor
public final class AudioTrackActivator {
    private var cancellables = Set<AnyCancellable>()

    public init() {}

    /// Amène le lecteur à l'état voulu, dans l'ordre de la loi.
    public func apply(to player: AVPlayer, wantsMuted: Bool) {
        for step in AudioTrackActivationLaw.steps(playerIsMuted: player.isMuted, wantsMuted: wantsMuted) {
            switch step {
            case .silencePlayer: player.isMuted = true
            case .soundPlayer: player.isMuted = false
            case .disableAudioTracks: setAudioTracks(of: player, effectiveMuted: true)
            case .enableAudioTracks: setAudioTracks(of: player, effectiveMuted: false)
            }
        }
    }

    /// Pose l'état voulu maintenant, puis le repose à chaque élément qui
    /// devient prêt. `effectiveMuted` est relue à chaque fois : une surface
    /// dont le mute change n'a rien à re-déclarer.
    public func bind(to player: AVPlayer, effectiveMuted: @escaping @MainActor () -> Bool) {
        release()
        apply(to: player, wantsMuted: effectiveMuted())
        player.publisher(for: \.currentItem)
            .receive(on: DispatchQueue.main)
            .compactMap { $0 }
            .map { $0.publisher(for: \.status).receive(on: DispatchQueue.main) }
            .switchToLatest()
            .sink { [weak self, weak player] status in
                guard let self, let player,
                      AudioTrackActivationLaw.mayTouchTracks(itemStatus: status) else { return }
                self.setAudioTracks(of: player, effectiveMuted: effectiveMuted())
            }
            .store(in: &cancellables)
    }

    /// Rend toutes les pistes audio d'un lecteur qu'on remet au pool : le pool
    /// sert aussi le lecteur de stories, qui n'attend aucune piste éteinte.
    public func restore(of player: AVPlayer) {
        setAudioTracks(of: player, effectiveMuted: false)
    }

    public func release() {
        cancellables.removeAll()
    }

    private func setAudioTracks(of player: AVPlayer, effectiveMuted: Bool) {
        items(of: player).forEach { setAudioTracks(on: $0, effectiveMuted: effectiveMuted) }
    }

    private func items(of player: AVPlayer) -> [AVPlayerItem] {
        if let queue = player as? AVQueuePlayer { return queue.items() }
        return [player.currentItem].compactMap { $0 }
    }

    private func setAudioTracks(on item: AVPlayerItem, effectiveMuted: Bool) {
        guard AudioTrackActivationLaw.mayTouchTracks(itemStatus: item.status) else { return }
        let tracks = item.tracks
        let states = tracks.map {
            AudioTrackActivationLaw.TrackState(mediaType: $0.assetTrack?.mediaType, isEnabled: $0.isEnabled)
        }
        zip(tracks, AudioTrackActivationLaw.writes(for: states, effectiveMuted: effectiveMuted))
            .forEach { track, write in
                if let write { track.isEnabled = write }
            }
    }
}
