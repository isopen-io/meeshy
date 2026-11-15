import Combine
import Foundation
import MeeshySDK

/// Ce que l'en-tête d'une conversation sait de l'appel en cours : deux faits,
/// jamais l'état complet de `CallManager`. Un appel traverse sept états
/// (`ringing`, `offering`, `connecting`, `connected`, `reconnecting`…) et
/// publie une trentaine de champs ; le bouton d'appel ne change d'allure que
/// deux fois par appel — au début et à la fin.
nonisolated struct CallHeaderSnapshot: Equatable, Sendable {
    let isActive: Bool
    let conversationId: String?

    static let idle = CallHeaderSnapshot(isActive: false, conversationId: nil)

    /// Un appel actif ne s'affiche que dans la conversation qui l'héberge. Un
    /// identifiant inconnu (appel réveillé par VoIP sans ce champ) dégrade en
    /// affichant la pastille : jamais priver l'utilisateur d'un chemin de retour.
    func showsReturnIndicator(for conversationId: String) -> Bool {
        guard isActive else { return false }
        guard let activeConversationId = self.conversationId else { return true }
        return activeConversationId == conversationId
    }
}

nonisolated enum CallHeaderPresentation: Equatable {
    case none
    case start
    case returnToCall
    case rejoin(ActiveCallSession)

    static func resolve(
        snapshot: CallHeaderSnapshot,
        reconciled: ActiveCallSession?,
        canStart: Bool,
        conversationId: String
    ) -> CallHeaderPresentation {
        if snapshot.isActive {
            return snapshot.showsReturnIndicator(for: conversationId) ? .returnToCall : .none
        }
        if let reconciled { return .rejoin(reconciled) }
        return canStart ? .start : .none
    }

    static func shouldReconcile(snapshot: CallHeaderSnapshot) -> Bool {
        !snapshot.isActive
    }
}

/// L'unique abonné de l'en-tête à la pile d'appel. Il lit `CallManagerHost`
/// (jamais `CallManager.shared`) : tant qu'aucun appel n'a réveillé la pile,
/// `manager` reste `nil` et le snapshot vaut `.idle` — ouvrir une conversation
/// ne construit ni CallKit, ni WebRTC, ni PiP (#7955).
@MainActor
final class CallHeaderSnapshotStore: ObservableObject {
    nonisolated deinit {}

    static let shared = CallHeaderSnapshotStore.live(host: .shared)

    @Published private(set) var snapshot = CallHeaderSnapshot.idle

    private var subscription: AnyCancellable?

    init(
        states: AnyPublisher<CallState, Never>,
        conversationIds: AnyPublisher<String?, Never>
    ) {
        subscription = states
            .combineLatest(conversationIds)
            .map { state, conversationId in
                state.isActive
                    ? CallHeaderSnapshot(isActive: true, conversationId: conversationId)
                    : CallHeaderSnapshot.idle
            }
            .removeDuplicates()
            .sink { [weak self] next in
                guard let self, self.snapshot != next else { return }
                self.snapshot = next
            }
    }

    static func live(host: CallManagerHost) -> CallHeaderSnapshotStore {
        CallHeaderSnapshotStore(
            states: host.callStatePublisher,
            conversationIds: host.$manager
                .map { manager -> AnyPublisher<String?, Never> in
                    manager.map { $0.$conversationId.eraseToAnyPublisher() }
                        ?? Just<String?>(nil).eraseToAnyPublisher()
                }
                .switchToLatest()
                .eraseToAnyPublisher()
        )
    }
}
