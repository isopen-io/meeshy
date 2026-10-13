import SwiftUI
import MeeshyUI

// MARK: - L'écoute, lue là où elle se peint (#10568)

/// **Ce qu'une page peint de la lecture, figé en valeur.**
///
/// `nonisolated` : une valeur, comparable hors de tout acteur.
nonisolated struct AudioFullscreenPlaybackSnapshot: Equatable, Sendable {
    let progress: Double
    let currentTime: TimeInterval
    let duration: TimeInterval
    let isPlaying: Bool
    let isLoading: Bool

    /// Une page dont le moteur ne joue pas la piste.
    static let idle = AudioFullscreenPlaybackSnapshot(progress: 0, currentTime: 0, duration: 0,
                                                      isPlaying: false, isLoading: false)
}

extension AudioFullscreenPlaybackSnapshot {

    /// L'état du moteur partagé, vu depuis la page de `attachmentId`.
    @MainActor
    init(player: AudioPlaybackManager, attachmentId: String) {
        guard player.attachmentId == attachmentId else {
            self = .idle
            return
        }
        self.init(progress: player.duration > 0 ? player.progress : 0,
                  currentTime: player.currentTime,
                  duration: player.duration,
                  isPlaying: player.isPlaying,
                  isLoading: player.isLoading)
    }
}

/// **Seul ce qui BOUGE avec la lecture observe le lecteur.**
///
/// La page entière observait le moteur partagé : à chaque tick de progression,
/// toutes les pages réalisées — hors écran comprises — refaisaient leur corps,
/// onde et transcription avec. Le balayage perdait ses images pendant l'écoute,
/// et d'autant plus qu'on avait traversé de vocaux.
///
/// La page ne lit plus rien du moteur. Ses quatre morceaux animés (l'anneau,
/// l'onde, le transport, la transcription) passent par cette portée, qui
/// n'observe que si la page est celle qu'on regarde (`isLive`) ; une voisine se
/// peint au repos, sans abonnement.
struct AudioFullscreenPlaybackScope<Content: View>: View {
    let player: AudioPlaybackManager
    let attachmentId: String
    let isLive: Bool
    @ViewBuilder let content: (AudioFullscreenPlaybackSnapshot, PlaybackSpeed) -> Content

    var body: some View {
        if isLive {
            Live(player: player, attachmentId: attachmentId, content: content)
        } else {
            content(.idle, player.speed)
        }
    }

    private struct Live: View {
        @ObservedObject var player: AudioPlaybackManager
        let attachmentId: String
        let content: (AudioFullscreenPlaybackSnapshot, PlaybackSpeed) -> Content

        var body: some View {
            content(AudioFullscreenPlaybackSnapshot(player: player, attachmentId: attachmentId), player.speed)
        }
    }
}
