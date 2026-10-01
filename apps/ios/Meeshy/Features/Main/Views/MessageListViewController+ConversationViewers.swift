import UIKit
import MeeshySDK

// MARK: - « Est dans la conversation » (#8892)

extension MessageListViewController {

    /// Qui a l'écran de CETTE conversation ouvert, lu UNE fois par
    /// configuration de cellule et remis aux rangées en primitif : aucune
    /// cellule n'observe `PresenceManager`. Quand l'ensemble change,
    /// `refreshSignal` (observé par `observeConversationViewModel`)
    /// reconfigure les cellules visibles.
    var conversationHereUserIds: Set<String> {
        guard let conversationId = conversationViewModel?.conversationId else { return [] }
        return PresenceManager.shared.conversationViewers.users(in: conversationId)
    }
}
