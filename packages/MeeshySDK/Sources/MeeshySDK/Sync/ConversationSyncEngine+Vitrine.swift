#if DEBUG
import Foundation

extension ConversationSyncEngine {
    /// Vitrine App Store (#8855, DEBUG uniquement) : range une liste fixée par le point
    /// d'écriture RÉCONCILIÉ de la liste, comme le ferait `fullSync` — jamais par une écriture
    /// en bloc de plus (`ConversationListCacheWriterGuardTests`).
    @discardableResult
    public func debugVitrineSaveList(_ conversations: [MeeshyConversation]) async -> Bool {
        await saveSorted(conversations, to: "list")
    }
}
#endif
