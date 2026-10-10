import Foundation
import Combine
import UIKit
import MeeshySDK
import MeeshyUI

/// **Exécute `VoicePlaybackActivityLaw`** depuis le lecteur partagé
/// (`ConversationAudioCoordinator`) — celui du mini-lecteur et de Now
/// Playing : l'îlot n'a pas d'état à lui (#9783).
///
/// Le lecteur publie sa position cinquante fois par seconde ; ses changements
/// sont relus au plus deux fois par seconde, et la loi n'en retient que les
/// ruptures. La relecture est différée d'un tour (`receive(on:)`) :
/// `objectWillChange` part AVANT la valeur.
@MainActor
final class VoicePlaybackLiveActivityCoordinator {
    nonisolated deinit {}

    static let shared = VoicePlaybackLiveActivityCoordinator()

    private weak var player: ConversationAudioCoordinator?
    private var running: VoicePlaybackSnapshot?
    private var host: (any LiveActivityHostProviding<VoicePlaybackSnapshot>)?
    private var cancellables = Set<AnyCancellable>()

    func bind(_ player: ConversationAudioCoordinator) {
        guard self.player !== player else { return }
        self.player = player
        cancellables = []
        guard let host = makeHost() else { return }
        self.host = host
        host.endOrphans()
        LiveActivityCommandBinding.shared.install()

        let changes = player.objectWillChange
            .throttle(for: .milliseconds(500), scheduler: DispatchQueue.main, latest: true)
            .map { _ in () }
        let foreground = NotificationCenter.default
            .publisher(for: UIApplication.didBecomeActiveNotification)
            .map { _ in () }
        changes.merge(with: foreground)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.apply() }
            .store(in: &cancellables)
    }

    private func makeHost() -> (any LiveActivityHostProviding<VoicePlaybackSnapshot>)? {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return nil }
        return LiveActivityHost<VoicePlaybackActivityAttributes> {
            VoicePlaybackActivityAttributes(labels: VoicePlaybackLabels(
                play: String(localized: "media.playAudio", defaultValue: "Lire l'audio", bundle: .main),
                pause: String(localized: "mini_player.pause", defaultValue: "Mettre en pause", bundle: .main),
                back: String(localized: "liveActivity.playback.back15", defaultValue: "Reculer de 15 secondes", bundle: .main),
                forward: String(localized: "liveActivity.playback.forward15", defaultValue: "Avancer de 15 secondes", bundle: .main)
            ))
        }
        #else
        return nil
        #endif
    }

    private static var wording: VoicePlaybackActivityLaw.Wording {
        VoicePlaybackActivityLaw.Wording(
            voiceMessage: MediaKindLabel.voiceMessageTitle(),
            protectedMessage: String(localized: "liveActivity.playback.protected", defaultValue: "Message protégé", bundle: .main)
        )
    }

    private func apply() {
        guard let player, let host else { return }
        let step = VoicePlaybackActivityLaw.step(running: running, input: input(from: player), wording: Self.wording)
        running = step.running
        switch step.action {
        case .none:
            guard let running, !host.isRunning, UIApplication.shared.applicationState == .active else { return }
            host.start(running)
        case .start(let snapshot):
            host.start(snapshot)
        case .update(let snapshot):
            host.isRunning ? host.update(snapshot) : host.start(snapshot)
        case .end(let snapshot):
            host.end(snapshot, dismissAfter: 0)
        }
    }

    private func input(from player: ConversationAudioCoordinator) -> VoicePlaybackActivityLaw.Input {
        VoicePlaybackActivityLaw.Input(
            track: track(from: player),
            isPlaying: player.isPlaying,
            position: player.currentTime,
            duration: player.duration,
            rate: player.speed.rawValue,
            upNextCount: max(0, player.queueCount - 1),
            now: Date()
        )
    }

    private func track(from player: ConversationAudioCoordinator) -> VoicePlaybackActivityLaw.Track? {
        guard let context = player.activeContext else { return nil }
        let head = player.activeTrack.flatMap { $0.attachmentId == context.attachmentId ? $0 : nil }
        return VoicePlaybackActivityLaw.Track(
            attachmentId: context.attachmentId,
            messageId: context.messageId,
            conversationId: context.conversationId,
            conversationName: context.conversationName,
            senderName: context.senderName,
            accentHex: DynamicColorGenerator.colorForName(context.senderName),
            isProtected: head?.isProtected ?? true,
            trackLanguage: head?.trackLanguage,
            isTranslatedTrack: head?.isTranslatedTrack ?? false,
            durationHint: Double(context.durationMs) / 1000
        )
    }
}
