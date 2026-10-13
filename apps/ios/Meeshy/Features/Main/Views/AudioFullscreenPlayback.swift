import SwiftUI
import MeeshySDK
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

// MARK: - La transcription ne se refait qu'au changement de segment (#10568)

/// **Le karaoké avance par SEGMENT, pas par tick.**
///
/// La transcription recevait `currentTime` : dix fois par seconde, ses
/// centaines de mots — un bouton chacun, mesurés un à un par la mise en page
/// en flux — étaient réévalués et remesurés pour une surbrillance qui ne bouge
/// qu'une à trois fois par seconde. Le rapport système de l'iPhone du porteur
/// (2026-10-13) montrait 59 % de CPU en moyenne, dans le rendu.
///
/// Le segment actif se résout ICI, à chaque tick, à coût négligeable ; la vue
/// se compare sur lui, et SwiftUI ne la refait que lorsqu'il change.
struct AudioFullscreenTranscript: View, Equatable {
    let segments: [TranscriptionDisplaySegment]
    let activeIndex: Int?
    let accentColor: String
    let maxHeight: CGFloat
    let onSeek: (Double) -> Void

    init(segments: [TranscriptionDisplaySegment],
         playback: AudioFullscreenPlaybackSnapshot,
         accentColor: String,
         maxHeight: CGFloat,
         onSeek: @escaping (Double) -> Void) {
        self.segments = segments
        self.activeIndex = AudioPlayerView.activeSegmentIndex(segments: segments,
                                                              currentTime: playback.currentTime,
                                                              progress: playback.progress,
                                                              isPlaying: playback.isPlaying)
        self.accentColor = accentColor
        self.maxHeight = maxHeight
        self.onSeek = onSeek
    }

    static func == (lhs: AudioFullscreenTranscript, rhs: AudioFullscreenTranscript) -> Bool {
        lhs.activeIndex == rhs.activeIndex
            && lhs.accentColor == rhs.accentColor
            && lhs.maxHeight == rhs.maxHeight
            && lhs.segments.count == rhs.segments.count
            && lhs.segments.first?.id == rhs.segments.first?.id
    }

    var body: some View {
        var view = MediaTranscriptionView(segments: segments,
                                          currentTime: 0,
                                          accentColor: accentColor,
                                          maxHeight: maxHeight,
                                          isPlaying: activeIndex != nil,
                                          fitsContent: true,
                                          onSeek: onSeek)
        view.resolvedActiveIndex = .some(activeIndex)
        return view
    }
}
