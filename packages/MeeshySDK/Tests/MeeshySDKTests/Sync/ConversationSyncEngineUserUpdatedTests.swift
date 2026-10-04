import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// #9307 — `user:updated` ne repeint plus seulement la ligne d'un direct : les
/// copies PERSISTÉES du pair (messages, participants, amis, demandes, fiche)
/// suivent, pour qu'une réouverture serve le nouveau nom sans réseau.
final class ConversationSyncEngineUserUpdatedTests: XCTestCase {

    private func makeEngine() throws -> (engine: ConversationSyncEngine, socket: MockMessageSocket, cache: CacheCoordinator) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        let cache = CacheCoordinator(messageSocket: socket, socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: socket,
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
        return (engine, socket, cache)
    }

    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        return await condition()
    }

    private func renamedBob() throws -> UserUpdatedEvent {
        let json = #"{"userId":"u-bob","changes":{"displayName":"Bobby","firstName":null,"lastName":null,"username":"bobby","avatar":"https://cdn/new.png"}}"#
        return try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(json.utf8))
    }

    func test_userUpdatedRelay_forwardsSenderRepaintToTheCanonicalStore() async throws {
        let (engine, socket, _) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        await engine.startSocketRelay()
        let event = try renamedBob()

        socket.userUpdated.send(event)

        let received = await waitUntil { await collector.mutations.contains(.senderRepainted(event)) }
        XCTAssertTrue(received)
    }

    func test_userUpdatedRelay_repaintsTheGroupMembersCache() async throws {
        let (engine, socket, cache) = try makeEngine()
        try await cache.participants.save([
            PaginatedParticipant(id: "p-bob", userId: "u-bob", username: "bob", displayName: "Bob"),
            PaginatedParticipant(id: "p-alice", userId: "u-alice", username: "alice", displayName: "Alice"),
        ], for: "c-group")
        await engine.startSocketRelay()

        socket.userUpdated.send(try renamedBob())

        let repainted = await waitUntil {
            await cache.participants.load(for: "c-group").snapshot()?.map(\.name) == ["Bobby", "Alice"]
        }
        XCTAssertTrue(repainted)
    }

    func test_userUpdatedRelay_repaintsCachedMessagesFriendsAndProfile() async throws {
        let (engine, socket, cache) = try makeEngine()
        try await cache.messages.save([
            MeeshyMessage(id: "m1", conversationId: "c-group", senderId: "p-bob", content: "salut",
                          senderName: "Bob", senderUsername: "bob", senderUserId: "u-bob"),
        ], for: "c-group")
        try await cache.friends.save([FriendRequestUser(id: "u-bob", username: "bob", displayName: "Bob")], for: "friends")
        try await cache.profiles.save([MeeshyUser(id: "u-bob", username: "bob", displayName: "Bob")], for: "u-bob")
        await engine.startSocketRelay()

        socket.userUpdated.send(try renamedBob())

        let repainted = await waitUntil {
            let message = await cache.messages.load(for: "c-group").snapshot()?.first
            let friend = await cache.friends.load(for: "friends").snapshot()?.first
            let profile = await cache.profiles.load(for: "u-bob").snapshot()?.first
            return message?.senderName == "Bobby" && message?.senderAvatarURL == "https://cdn/new.png"
                && friend?.username == "bobby" && profile?.displayName == "Bobby"
        }
        XCTAssertTrue(repainted)
    }
}
