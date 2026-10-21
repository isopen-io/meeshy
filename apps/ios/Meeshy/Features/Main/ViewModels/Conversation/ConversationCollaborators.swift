import Foundation
import MeeshySDK

/// Les collaborateurs que `ConversationViewModel` délègue : un seul agrégat
/// injecté, jamais un paramètre d'init de plus par collaborateur. Chaque champ
/// a son défaut vivant ; un test en remplace un seul.
struct ConversationCollaborators {
    let readReceipts: any ConversationReadReceiptSenderProviding

    init(
        persistence: MessagePersistenceActor,
        syncEngine: ConversationSyncEngineProviding,
        readReceipts: (any ConversationReadReceiptSenderProviding)? = nil
    ) {
        self.readReceipts = readReceipts ?? ConversationReadReceiptSender(syncEngine: syncEngine)
    }
}
