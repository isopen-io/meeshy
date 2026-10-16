import Foundation
import Combine
import MeeshySDK

// L'apparence choisie pour la conversation, observée par le fil lui-même (#10753) :
// la valeur de la conversation chargée, puis tout changement relayé par
// `ConversationAppearanceChange` (choix local, écho d'un autre appareil). La peau
// des bulles s'en déduit et entre dans les cellules par `rowConversationContext`.
extension MessageListViewController {

    func observeConversationAppearance(_ vm: ConversationViewModel) {
        let conversationId = vm.conversationId
        adoptConversationAppearance(ConversationAppearanceChange.latest(for: conversationId) ?? vm.currentConversation?.userState.appearance, for: conversationId)

        vm.$currentConversation
            .compactMap { $0?.userState.appearance }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] appearance in
                self?.adoptConversationAppearance(ConversationAppearanceChange.latest(for: conversationId) ?? appearance, for: conversationId)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: ConversationAppearanceChange.notification)
            .compactMap { ConversationAppearanceChange.appearance(in: $0, for: conversationId) }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] appearance in
                self?.adoptConversationAppearance(appearance, for: conversationId)
            }
            .store(in: &cancellables)
    }

    /// Seul un changement de PEAU repeint les cellules : un fond changé seul n'y touche pas.
    func adoptConversationAppearance(_ appearance: ConversationAppearance?, for conversationId: String) {
        conversationAppearance = appearance
        BubbleSkinLedger.record(appearance, for: conversationId)
        let skin = BubbleSkin.resolve(appearance, isDark: isDark)
        guard skin != bubbleSkin else { return }
        bubbleSkin = skin
        guard dataSource != nil else { return }
        applySnapshot(reconfigure: .allItems)
    }
}
