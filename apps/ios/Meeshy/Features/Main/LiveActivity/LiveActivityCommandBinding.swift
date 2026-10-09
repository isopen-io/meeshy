import Foundation

/// **Ce que l'app fait d'un bouton touché dans l'îlot ou sur l'écran
/// verrouillé** (#9782, #9783, #9784).
///
/// `LiveActivityCommandIntent` s'exécute dans le processus de l'app et confie
/// sa commande à `LiveActivityCommandRouter` ; ce lien la remet au service qui
/// porte l'état — le même chemin qu'un toucher dans l'app, jamais un second.
/// Une commande sans objet (aucun appel, aucune lecture) est sans effet.
@MainActor
final class LiveActivityCommandBinding {
    nonisolated deinit {}

    static let shared = LiveActivityCommandBinding()

    private var isInstalled = false

    func install() {
        guard !isInstalled else { return }
        isInstalled = true
        LiveActivityCommandRouter.handler = { command in
            LiveActivityCommandBinding.perform(command)
        }
    }

    static func perform(_ command: LiveActivityCommand) {
        switch command {
        case .callToggleMute:
            guard let manager = CallManagerHost.shared.manager, manager.callState.isActive else { return }
            manager.toggleMute()
        case .callHangUp:
            CallManagerHost.shared.manager?.endCall()
        case .playbackToggle:
            guard ConversationAudioCoordinator.shared.activeContext != nil else { return }
            ConversationAudioCoordinator.shared.togglePlayPause()
        case .playbackBack:
            ConversationAudioCoordinator.shared.skip(by: -VoicePlaybackActivityLaw.skipInterval)
        case .playbackForward:
            ConversationAudioCoordinator.shared.skip(by: VoicePlaybackActivityLaw.skipInterval)
        case .recordingStop, .recordingCancel:
            return
        }
    }
}
