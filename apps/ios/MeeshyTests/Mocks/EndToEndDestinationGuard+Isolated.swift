import Foundation
import MeeshySDK
@testable import Meeshy

extension EndToEndDestinationGuard {
    /// Une garde sans état partagé : une mémoire du seul test, un cache vide.
    @MainActor
    static func isolated(remembering ids: [String] = []) -> EndToEndDestinationGuard {
        let ledger = EndToEndRegimeLedger(memory: EndToEndRegimeMemory(defaults: nil))
        ids.forEach { ledger.learnEndToEnd(for: $0) }
        return EndToEndDestinationGuard(
            ledger: ledger,
            cache: ConversationCacheReader(loadConversations: { .empty }, loadThread: { _ in .empty })
        )
    }
}
