import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Routeur coordinator pour les surfaces audio HORS conversation (feed,
/// commentaire, détail de post). Miroir de `AudioBubbleRouter` : actif →
/// l'`AudioPlayerView` rendue par `player` reçoit le moteur du coordinator
/// (carte Now Playing, lecture background, mini-player) ; inactif → moteur
/// local possédé par la vue, et le tap play démarre une file d'UN élément
/// sur le coordinator. Décision produit Meeshy → app-side (SDK purity).
///
/// Les réels n'utilisent PAS ce routeur (profil `.transient`, parité avec
/// les réels vidéo — décision de spec 2026-08-10).
struct CoordinatedAudioPlayer<Player: View>: View {
    let attachmentId: String
    let nowPlayingName: String
    let nowPlayingArtworkURL: String?
    let makeQueuedAudio: () -> QueuedAudio
    /// Rend la vue player : reçoit (externalPlayer, onPlayRequest).
    let player: (AudioPlaybackManager?, @escaping () -> Void) -> Player

    @State private var externalEngine: AudioPlaybackManager?
    private let coordinator: ConversationAudioCoordinator
    private let activePublisher: AnyPublisher<Bool, Never>

    init(
        attachmentId: String,
        nowPlayingName: String,
        nowPlayingArtworkURL: String? = nil,
        coordinatorForTesting: ConversationAudioCoordinator? = nil,
        makeQueuedAudio: @escaping () -> QueuedAudio,
        @ViewBuilder player: @escaping (AudioPlaybackManager?, @escaping () -> Void) -> Player
    ) {
        self.attachmentId = attachmentId
        self.nowPlayingName = nowPlayingName
        self.nowPlayingArtworkURL = nowPlayingArtworkURL
        self.makeQueuedAudio = makeQueuedAudio
        self.player = player
        let coord = coordinatorForTesting ?? .shared
        self.coordinator = coord
        self.activePublisher = coord.$activeContext
            .map { $0?.attachmentId == attachmentId }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    var isActiveForTesting: Bool {
        coordinator.activeContext?.attachmentId == attachmentId
    }

    func requestPlayForTesting() { startOnCoordinator() }

    private func startOnCoordinator() {
        coordinator.play(
            current: makeQueuedAudio(),
            tail: [],
            conversationName: nowPlayingName,
            conversationArtworkURL: nowPlayingArtworkURL
        )
    }

    var body: some View {
        player(externalEngine) { startOnCoordinator() }
            .onReceive(activePublisher) { active in
                externalEngine = active ? coordinator.engineForBubble : nil
            }
    }
}
