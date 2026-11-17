import XCTest
import GRDB
@testable import MeeshySDK

/// LE CACHE DES MEMBRES (#18916) — ce qui le rend faux, et ce qui ne le rend pas.
///
/// `conversation:joined` / `conversation:left` sont AUSSI les accusés que la
/// passerelle rend à la seule socket à chaque ouverture et fermeture de fil, et à
/// chaque salle rejointe à la reconnexion : les écouter vidait le cache des
/// membres à chaque ouverture. Les faits d'effectif voyagent par
/// `conversation:participant-joined/left/banned/unbanned`.
///
/// Les témoins pilotent le relais réel du moteur et lisent le cache après coup.
final class ConversationSyncEngineParticipantsCacheTests: XCTestCase {

    private struct RosterHarness {
        let cache: CacheCoordinator
        let engine: ConversationSyncEngine
        let socket: MockMessageSocket
    }

    private func makeHarness() async throws -> RosterHarness {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        let social = MockSocialSocket()
        let cache = CacheCoordinator(messageSocket: socket, socialSocket: social, db: db)
        let engine = ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: socket,
            socialSocket: social,
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
        await engine.startSocketRelay()
        return RosterHarness(cache: cache, engine: engine, socket: socket)
    }

    private func seedMembers(_ ids: [String], for conversationId: String, in cache: CacheCoordinator) async throws {
        try await cache.participants.save(ids.map { TestFactories.makeParticipant(id: $0) }, for: conversationId)
    }

    /// Le relais est une file ORDONNÉE : quand l'événement posé après l'accusé a
    /// vidé sa conversation témoin, l'accusé est passé.
    private func waitUntilEmpty(_ conversationId: String, in cache: CacheCoordinator) async -> Bool {
        for _ in 0..<200 {
            if case .empty = await cache.participants.load(for: conversationId) { return true }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        return false
    }

    private func joined(_ conversationId: String) throws -> ParticipantJoinedEvent {
        try JSONDecoder().decode(ParticipantJoinedEvent.self, from: Data(
            #"{"conversationId":"\#(conversationId)","userId":"u2","displayName":"Awa","joinedAt":"2026-11-17T10:00:00.000Z","memberCount":3}"#.utf8
        ))
    }

    private func left(_ conversationId: String) throws -> ParticipantLeftEvent {
        try JSONDecoder().decode(ParticipantLeftEvent.self, from: Data(
            #"{"conversationId":"\#(conversationId)","participantId":"p2","userId":"u2","displayName":"Awa","leftAt":"2026-11-17T10:00:00.000Z","memberCount":2}"#.utf8
        ))
    }

    private func banned(_ conversationId: String) throws -> ParticipantBannedEvent {
        try JSONDecoder().decode(ParticipantBannedEvent.self, from: Data(
            #"{"conversationId":"\#(conversationId)","participantId":"p2","userId":"u2","bannedBy":{"id":"admin"},"bannedAt":"2026-11-17T10:00:00.000Z","membershipEnded":true}"#.utf8
        ))
    }

    private func unbanned(_ conversationId: String) throws -> ParticipantUnbannedEvent {
        try JSONDecoder().decode(ParticipantUnbannedEvent.self, from: Data(
            #"{"conversationId":"\#(conversationId)","participantId":"p2","userId":"u2","membershipRestored":true}"#.utf8
        ))
    }

    // MARK: - Les accusés de jonction ne touchent pas au cache

    func test_conversationJoinedAck_keepsParticipantsCache() async throws {
        let harness = try await makeHarness()
        try await seedMembers(["p1"], for: "c1", in: harness.cache)
        try await seedMembers(["p9"], for: "sentinel", in: harness.cache)

        harness.socket.conversationJoined.send(ConversationParticipationEvent(conversationId: "c1", userId: "me"))
        try harness.socket.participantJoined.send(joined("sentinel"))

        let relayed = await waitUntilEmpty("sentinel", in: harness.cache)
        XCTAssertTrue(relayed, "l'adhésion posée après l'accusé est relayée")
        guard case .fresh(let kept, _) = await harness.cache.participants.load(for: "c1") else {
            return XCTFail("l'accusé de jonction d'une ouverture de fil a vidé la liste des membres")
        }
        XCTAssertEqual(kept.map(\.id), ["p1"])
        withExtendedLifetime(harness.engine) {}
    }

    func test_conversationLeftAck_keepsParticipantsCache() async throws {
        let harness = try await makeHarness()
        try await seedMembers(["p1"], for: "c1", in: harness.cache)
        try await seedMembers(["p9"], for: "sentinel", in: harness.cache)

        harness.socket.conversationLeft.send(ConversationParticipationEvent(conversationId: "c1", userId: "me"))
        try harness.socket.participantJoined.send(joined("sentinel"))

        let relayed = await waitUntilEmpty("sentinel", in: harness.cache)
        XCTAssertTrue(relayed, "l'adhésion posée après l'accusé est relayée")
        guard case .fresh(let kept, _) = await harness.cache.participants.load(for: "c1") else {
            return XCTFail("l'accusé de fermeture de fil a vidé la liste des membres")
        }
        XCTAssertEqual(kept.map(\.id), ["p1"])
        withExtendedLifetime(harness.engine) {}
    }

    // MARK: - Les faits d'effectif l'invalident

    func test_participantJoined_invalidatesParticipantsCache() async throws {
        let harness = try await makeHarness()
        try await seedMembers(["p1"], for: "c1", in: harness.cache)

        try harness.socket.participantJoined.send(joined("c1"))

        let invalidated = await waitUntilEmpty("c1", in: harness.cache)
        XCTAssertTrue(invalidated, "une adhésion rend la liste des membres en cache fausse")
        withExtendedLifetime(harness.engine) {}
    }

    func test_participantLeft_invalidatesParticipantsCache() async throws {
        let harness = try await makeHarness()
        try await seedMembers(["p1", "p2"], for: "c1", in: harness.cache)

        try harness.socket.participantSelfLeft.send(left("c1"))

        let invalidated = await waitUntilEmpty("c1", in: harness.cache)
        XCTAssertTrue(invalidated, "un départ rend la liste des membres en cache fausse")
        withExtendedLifetime(harness.engine) {}
    }

    func test_participantBanned_invalidatesParticipantsCache() async throws {
        let harness = try await makeHarness()
        try await seedMembers(["p1", "p2"], for: "c1", in: harness.cache)

        try harness.socket.participantBanned.send(banned("c1"))

        let invalidated = await waitUntilEmpty("c1", in: harness.cache)
        XCTAssertTrue(invalidated, "un bannissement rend la liste des membres en cache fausse")
        withExtendedLifetime(harness.engine) {}
    }

    func test_participantUnbanned_invalidatesParticipantsCache() async throws {
        let harness = try await makeHarness()
        try await seedMembers(["p1"], for: "c1", in: harness.cache)

        try harness.socket.participantUnbanned.send(unbanned("c1"))

        let invalidated = await waitUntilEmpty("c1", in: harness.cache)
        XCTAssertTrue(invalidated, "une levée de bannissement rend la liste des membres en cache fausse")
        withExtendedLifetime(harness.engine) {}
    }
}
