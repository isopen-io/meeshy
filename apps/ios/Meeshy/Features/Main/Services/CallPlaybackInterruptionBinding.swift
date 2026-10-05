import Combine
import MeeshySDK
import MeeshyUI

/// **Un appel gèle les lecteurs à timeline, et les rend à sa fin (#8725).**
///
/// `CallManager` COUPE déjà tout média au début d'un appel
/// (`PlaybackCoordinator.stopAll()`) : l'audio de l'appel est exclusif. Une
/// story, elle, a une TIMELINE — son compte à rebours continuait sous la vue
/// d'appel, et l'utilisateur retrouvait en réduisant une autre slide que celle
/// qu'il regardait. `PlaybackInterruption` la gèle en place ; sa fin la relance
/// là où elle était, sauf si l'utilisateur l'avait lui-même mise en pause.
enum CallPlaybackInterruptionRule {
    /// `true` : l'interruption commence ; `false` : elle finit ; `nil` : rien ne
    /// change. Le panneau de fin (`.ended`) garde l'interruption — la vue d'appel
    /// est encore là ; seul le retour au repos (`.idle`) la lève, comme la
    /// reprise des vocaux (`ConversationAudioCoordinator.resumeAfterSystemCall`).
    static func transition(for state: CallState) -> Bool? {
        if state.isActive { return true }
        if state == .idle { return false }
        return nil
    }
}

@MainActor
final class CallPlaybackInterruptionBinding {
    nonisolated deinit {}
    static let shared = CallPlaybackInterruptionBinding()

    private var subscription: AnyCancellable?

    var isBound: Bool { subscription != nil }

    func bind(
        states: AnyPublisher<CallState, Never>? = nil,
        interruption: PlaybackInterruption? = nil
    ) {
        guard subscription == nil else { return }
        let target = interruption ?? .shared
        subscription = (states ?? CallManagerHost.shared.callStatePublisher)
            .compactMap(CallPlaybackInterruptionRule.transition(for:))
            .removeDuplicates()
            .sink { active in
                if active { target.begin() } else { target.end() }
            }
    }
}
