import UIKit
import MeeshySDK

// MARK: - « Est dans la conversation » (#8892)

extension MessageListViewController {

    /// Qui a l'écran de CETTE conversation ouvert, et qui y est actif
    /// (#9061), lu UNE fois par configuration de cellule et remis aux rangées
    /// en valeur : aucune cellule n'observe `PresenceManager`. Quand
    /// l'ensemble change, `refreshSignal` (observé par
    /// `observeConversationViewModel`) reconfigure les cellules visibles.
    var conversationHere: ConversationHereRoster {
        guard let conversationId = conversationViewModel?.conversationId else { return ConversationHereRoster() }
        return PresenceManager.shared.conversationViewers.roster(in: conversationId)
    }
}
