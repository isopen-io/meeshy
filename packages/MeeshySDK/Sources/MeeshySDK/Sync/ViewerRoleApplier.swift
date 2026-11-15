import Combine
import Foundation

/// #15987 — `participant:role-updated` qui nomme le LECTEUR : son rang et la capacité que la
/// passerelle lui remet (`viewerCapabilities`, #14690) passent sur sa ligne de liste. Sans
/// capacité (serveur antérieur), celle de l'ancien rang s'efface quand le rang change : la
/// règle locale reprend, jamais un `false` périmé.
///
/// Pur et sans état ; `nil` = rien à écrire (autre membre, conversation hors liste, aucun écart).
enum ViewerRoleFold {
    static func applying(
        _ event: ParticipantRoleUpdatedEvent, to conversations: [MeeshyConversation], readerId: String
    ) -> [MeeshyConversation]? {
        guard !readerId.isEmpty, event.userId == readerId, !event.newRole.isEmpty,
              let index = conversations.firstIndex(where: { $0.id == event.conversationId }) else { return nil }
        var row = conversations[index]
        let sameRole = row.currentUserRole?.lowercased() == event.newRole.lowercased()
        let capabilities = event.viewerCapabilities ?? (sameRole ? row.viewerCapabilities : nil)
        // `MeeshyConversation ==` ne compare que l'`id` : l'écart se lit champ par champ.
        guard row.currentUserRole != event.newRole || row.viewerCapabilities != capabilities else { return nil }
        row.currentUserRole = event.newRole
        row.viewerCapabilities = capabilities
        var next = conversations
        next[index] = row
        return next
    }
}

/// Le relais de `participant:role-updated` : le roster en cache se relit, et la ligne du
/// lecteur suit son rang (`ViewerRoleFold`).
///
/// Un type à part, pas une extension du moteur : le moteur est déjà bien au-delà du budget de cohésion.
struct ViewerRoleApplier {
    private let engine: ConversationSyncEngine

    init?(engine: ConversationSyncEngine?) {
        guard let engine else { return nil }
        self.engine = engine
    }

    func apply(_ event: ParticipantRoleUpdatedEvent) async {
        await engine.cache.participants.invalidate(for: event.conversationId)
        let readerId = await engine.currentUserId()
        let list = await engine.cache.conversations.load(for: "list").snapshot() ?? []
        guard ViewerRoleFold.applying(event, to: list, readerId: readerId) != nil else { return }
        await engine.cache.conversations.update(for: "list") { conversations in
            ViewerRoleFold.applying(event, to: conversations, readerId: readerId) ?? conversations
        }
        engine._conversationsDidChange.send()
    }
}
