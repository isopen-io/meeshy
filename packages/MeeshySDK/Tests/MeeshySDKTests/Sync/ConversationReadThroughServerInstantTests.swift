import XCTest
@testable import MeeshySDK

/// #19424 (iOS) — l'instant SERVEUR du dernier message lu sur l'appareil, par conversation. Tant que l'accusé n'est pas
/// confirmé, une ligne servie dont le dernier message n'est pas plus récent garde un non-lu nul — sans comparer
/// l'horloge de l'appareil à une horloge serveur.
final class ConversationReadThroughServerInstantTests: XCTestCase {

    private let lastMessage = Date(timeIntervalSince1970: 1_700_000_000)

    private func served(unread: Int, lastMessageAt: Date, confirmedThrough: Date? = nil) -> MeeshyConversation {
        var conv = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct, lastMessageAt: lastMessageAt, unreadCount: unread)
        conv.userState.lastReadMessageCreatedAt = confirmedThrough
        return conv
    }

    private func readOffline(through instant: Date) -> MeeshyConversation {
        var conv = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct, lastMessageAt: instant, unreadCount: 0)
        conv.userState.readThroughServerAt = instant
        return conv
    }

    func test_reconcileUnread_readOffline_servedSweepWithThreeUnread_keepsTheBadgeAtZero() {
        let result = ConversationSyncEngine.reconcileUnread(
            incoming: served(unread: 3, lastMessageAt: lastMessage),
            local: readOffline(through: lastMessage), openConversationId: nil
        )

        XCTAssertEqual(result.userState.unreadCount, 0)
        XCTAssertEqual(result.userState.readThroughServerAt, lastMessage, "l'accusé n'est pas confirmé : la frontière reste")
    }

    func test_reconcileUnread_aNewerMessageSinceTheRead_countsAgain() {
        let result = ConversationSyncEngine.reconcileUnread(
            incoming: served(unread: 1, lastMessageAt: lastMessage.addingTimeInterval(30)),
            local: readOffline(through: lastMessage), openConversationId: nil
        )

        XCTAssertEqual(result.userState.unreadCount, 1)
    }

    func test_reconcileUnread_onceTheServerCursorCaughtUp_theBoundaryIsDropped() {
        let result = ConversationSyncEngine.reconcileUnread(
            incoming: served(unread: 0, lastMessageAt: lastMessage, confirmedThrough: lastMessage),
            local: readOffline(through: lastMessage), openConversationId: nil
        )

        XCTAssertNil(result.userState.readThroughServerAt, "l'accusé est confirmé : la frontière locale n'a plus d'objet")
    }

    /// On lit EN REGARDANT la conversation : un balayage servi pendant qu'elle est ouverte ne porte jamais l'instant
    /// local. Le perdre ici rallumait le badge au balayage suivant, une fois la conversation quittée.
    func test_reconcileUnread_whileTheConversationIsOpen_theBoundarySurvivesTheServedSweep() {
        let result = ConversationSyncEngine.reconcileUnread(
            incoming: served(unread: 3, lastMessageAt: lastMessage),
            local: readOffline(through: lastMessage), openConversationId: "conv-1"
        )

        XCTAssertEqual(result.userState.unreadCount, 0)
        XCTAssertEqual(result.userState.readThroughServerAt, lastMessage, "la frontière traverse le balayage servi")
    }

    func test_markConversationReadLocally_recordsTheServedInstantOfTheLastMessage() async {
        let engine = ConversationSyncEngine(
            cache: .shared,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        try? await CacheCoordinator.shared.conversations.save([served(unread: 3, lastMessageAt: lastMessage)], for: "list")

        await engine.markConversationReadLocally("conv-1")

        let row = (await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []).first { $0.id == "conv-1" }
        XCTAssertEqual(row?.userState.unreadCount, 0)
        XCTAssertEqual(row?.userState.readThroughServerAt, lastMessage, "l'instant SERVEUR du dernier message, jamais l'horloge de l'appareil")
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
    }

    func test_codable_readThroughServerAt_survivesTheDiskCache() throws {
        let data = try JSONEncoder().encode(readOffline(through: lastMessage))
        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: data)

        XCTAssertEqual(decoded.userState.readThroughServerAt, lastMessage)
    }
}
