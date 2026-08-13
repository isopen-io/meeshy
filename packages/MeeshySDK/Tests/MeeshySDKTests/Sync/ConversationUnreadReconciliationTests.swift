import XCTest
@testable import MeeshySDK

/// La pastille de non-lu partait puis revenait : `fullSync` et `deltaSyncCore`
/// écrivaient la charge serveur telle quelle dans le cache liste, sans la garde
/// « conversation ouverte » que `handleUnreadUpdated` applique déjà, et sans
/// aucune frontière de lecture locale. Un retour en avant-plan ou une
/// reconnexion socket pendant que le `markAsRead` était encore dans l'outbox
/// re-injectait le compteur serveur.
///
/// `ConversationSyncEngine.reconcileUnread` encode la règle, purement, pour
/// qu'elle soit testable isolément et appliquée au MÊME endroit par les deux
/// chemins de sync.
final class ConversationUnreadReconciliationTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(
        id: String = "conv-1",
        unread: Int,
        lastMessageAt: Date,
        lastReadAt: Date? = nil
    ) -> MeeshyConversation {
        var conv = MeeshyConversation(
            id: id,
            identifier: "identifier-\(id)",
            type: .direct,
            lastMessageAt: lastMessageAt,
            unreadCount: unread
        )
        conv.userState.lastReadAt = lastReadAt
        return conv
    }

    // MARK: - Conversation ouverte

    func test_reconcileUnread_openConversation_isForcedToZero() {
        let incoming = makeConversation(unread: 75, lastMessageAt: t0)

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, local: nil, openConversationId: "conv-1"
        )

        XCTAssertEqual(result.userState.unreadCount, 0,
                       "l'utilisateur REGARDE cette conversation — tout compteur non nul est un mensonge visuel")
    }

    func test_reconcileUnread_openConversation_stampsAReadFrontier() {
        let incoming = makeConversation(unread: 4, lastMessageAt: t0)

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, local: nil, openConversationId: "conv-1"
        )

        XCTAssertNotNil(result.userState.lastReadAt,
                        "sans frontière posée, le prochain instantané serveur re-injecterait le compteur")
        XCTAssertGreaterThanOrEqual(result.userState.lastReadAt ?? .distantPast, t0)
    }

    // MARK: - Frontière de lecture locale

    func test_reconcileUnread_localReadAfterLastMessage_clampsServerCountToZero() {
        let local = makeConversation(unread: 0, lastMessageAt: t0, lastReadAt: t0.addingTimeInterval(5))
        let incoming = makeConversation(unread: 3, lastMessageAt: t0)

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, local: local, openConversationId: nil
        )

        XCTAssertEqual(result.userState.unreadCount, 0,
                       "la lecture locale est postérieure au dernier message connu du serveur : le compteur serveur est en retard")
    }

    func test_reconcileUnread_newerMessageThanLocalRead_keepsServerCount() {
        let local = makeConversation(unread: 0, lastMessageAt: t0, lastReadAt: t0)
        let incoming = makeConversation(unread: 2, lastMessageAt: t0.addingTimeInterval(60))

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, local: local, openConversationId: nil
        )

        XCTAssertEqual(result.userState.unreadCount, 2,
                       "un message VRAIMENT plus récent que la lecture doit rendre la conversation non lue")
    }

    func test_reconcileUnread_noLocalReadFrontier_keepsServerCount() {
        let local = makeConversation(unread: 0, lastMessageAt: t0, lastReadAt: nil)
        let incoming = makeConversation(unread: 7, lastMessageAt: t0)

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, local: local, openConversationId: nil
        )

        XCTAssertEqual(result.userState.unreadCount, 7,
                       "sans preuve de lecture locale le serveur fait autorité")
    }

    /// `markAsUnread` efface la frontière : remettre une conversation en non-lu
    /// doit tenir face au prochain instantané serveur.
    func test_reconcileUnread_clearedFrontier_letsMarkAsUnreadSurvive() {
        let local = makeConversation(unread: 1, lastMessageAt: t0, lastReadAt: nil)
        let incoming = makeConversation(unread: 1, lastMessageAt: t0)

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, local: local, openConversationId: nil
        )

        XCTAssertEqual(result.userState.unreadCount, 1)
        XCTAssertNil(result.userState.lastReadAt)
    }

    // MARK: - Monotonie de la frontière

    func test_reconcileUnread_preservesLocalFrontier_serverNeverCarriesIt() {
        let readAt = t0.addingTimeInterval(120)
        let local = makeConversation(unread: 0, lastMessageAt: t0, lastReadAt: readAt)
        // Le gateway ne renvoie jamais `lastReadAt` : la frontière est purement
        // locale et doit traverser chaque écrasement d'instantané.
        let incoming = makeConversation(unread: 0, lastMessageAt: t0, lastReadAt: nil)

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, local: local, openConversationId: nil
        )

        XCTAssertEqual(result.userState.lastReadAt, readAt)
    }

    /// La règle sert aussi `ConversationStore.hydrateMetadata`, où `incoming`
    /// n'est PAS le serveur mais le CACHE — qui, lui, porte une frontière.
    /// Une reprise `local ?? incoming` faisait alors RECULER une frontière que
    /// le cache venait d'avancer, et le compteur repartait. Une frontière de
    /// lecture est monotone : c'est la plus récente des deux qui vaut.
    func test_reconcileUnread_takesTheNewerFrontier_whenBothSidesCarryOne() {
        let local = makeConversation(unread: 0, lastMessageAt: t0, lastReadAt: t0.addingTimeInterval(10))
        let incoming = makeConversation(unread: 5, lastMessageAt: t0, lastReadAt: t0.addingTimeInterval(90))

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, local: local, openConversationId: nil
        )

        XCTAssertEqual(result.userState.lastReadAt, t0.addingTimeInterval(90))
        XCTAssertEqual(result.userState.unreadCount, 0,
                       "la frontière retenue est postérieure au dernier message : le compteur entrant est en retard")
    }

    func test_reconcileUnread_keepsIncomingMetadata() {
        let local = makeConversation(unread: 0, lastMessageAt: t0, lastReadAt: t0)
        var incoming = makeConversation(unread: 0, lastMessageAt: t0.addingTimeInterval(30))
        incoming.title = "Titre serveur"
        incoming.lastMessagePreview = "Aperçu serveur"

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, local: local, openConversationId: nil
        )

        XCTAssertEqual(result.title, "Titre serveur")
        XCTAssertEqual(result.lastMessagePreview, "Aperçu serveur")
        XCTAssertEqual(result.lastMessageAt, t0.addingTimeInterval(30))
    }

    // MARK: - Application par lot

    func test_reconcileUnreadList_appliesPerConversation() {
        let local = [
            makeConversation(id: "read-locally", unread: 0, lastMessageAt: t0, lastReadAt: t0.addingTimeInterval(1)),
            makeConversation(id: "genuinely-unread", unread: 0, lastMessageAt: t0, lastReadAt: t0)
        ]
        let incoming = [
            makeConversation(id: "read-locally", unread: 5, lastMessageAt: t0),
            makeConversation(id: "genuinely-unread", unread: 5, lastMessageAt: t0.addingTimeInterval(90)),
            makeConversation(id: "open-now", unread: 5, lastMessageAt: t0.addingTimeInterval(90))
        ]

        let result = ConversationSyncEngine.reconcileUnread(
            incoming: incoming, existing: local, openConversationId: "open-now"
        )

        let byId = Dictionary(uniqueKeysWithValues: result.map { ($0.id, $0.userState.unreadCount) })
        XCTAssertEqual(byId["read-locally"], 0)
        XCTAssertEqual(byId["genuinely-unread"], 5)
        XCTAssertEqual(byId["open-now"], 0)
    }
}
