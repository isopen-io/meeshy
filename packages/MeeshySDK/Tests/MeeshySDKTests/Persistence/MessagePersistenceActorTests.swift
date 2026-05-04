import XCTest
import GRDB
@testable import MeeshySDK

final class MessagePersistenceActorTests: XCTestCase {

    private var actor: MessagePersistenceActor!
    private var dbQueue: DatabaseQueue!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    // MARK: - Insert

    func test_insertOptimistic_persistsImmediately() async throws {
        let record = MessageRecordFactory.make(localId: "temp_001", conversationId: "conv_1")
        try await actor.insertOptimistic(record)

        let fetched = try actor.messages(for: "conv_1", limit: 10)
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].localId, "temp_001")
        XCTAssertEqual(fetched[0].state, .sending)
    }

    // MARK: - Apply Event

    func test_applyEvent_serverAck_updatesStateAndPersists() async throws {
        let record = MessageRecordFactory.make(localId: "temp_002")
        try await actor.insertOptimistic(record)

        let newState = try await actor.applyEvent(localId: "temp_002",
            event: .serverAck(serverId: "srv_abc", at: Date()))

        XCTAssertEqual(newState, .sent)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .sent)
        XCTAssertEqual(fetched[0].serverId, "srv_abc")
        XCTAssertEqual(fetched[0].changeVersion, 1)
    }

    func test_applyEvent_invalidTransition_returnsNil() async throws {
        let record = MessageRecordFactory.make(localId: "temp_003", state: .read)
        try await actor.insertOptimistic(record)

        let result = try await actor.applyEvent(localId: "temp_003", event: .startSending)
        XCTAssertNil(result)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].state, .read)
    }

    func test_applyEvent_nonexistentId_returnsNil() async throws {
        let result = try await actor.applyEvent(localId: "nope", event: .startSending)
        XCTAssertNil(result)
    }

    // MARK: - Pending IDs

    func test_serverAck_createsPendingIdRecord() async throws {
        let record = MessageRecordFactory.make(localId: "temp_004")
        try await actor.insertOptimistic(record)
        _ = try await actor.applyEvent(localId: "temp_004",
            event: .serverAck(serverId: "srv_pid", at: Date()))

        let serverId = try actor.resolveServerId(for: "temp_004")
        XCTAssertEqual(serverId, "srv_pid")

        let localId = try actor.resolveLocalId(forServerId: "srv_pid")
        XCTAssertEqual(localId, "temp_004")
    }

    // MARK: - Translations

    func test_saveTranslation_persists() async throws {
        let translation = TranslationRecord(
            id: "tr_1", messageLocalId: "msg_1", messageServerId: nil,
            targetLanguage: "en", translatedContent: "Hello",
            translationModel: "nllb-200", confidenceScore: 0.95,
            sourceLanguage: "fr", receivedAt: Date()
        )
        try await actor.saveTranslation(translation)

        let fetched = try actor.translations(for: "msg_1")
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched[0].translatedContent, "Hello")
    }

    // MARK: - Edit / Delete

    func test_markEdited_updatesContentAndFlag() async throws {
        let record = MessageRecordFactory.make(localId: "edit_1", content: "Original")
        try await actor.insertOptimistic(record)

        try await actor.markEdited(localId: "edit_1", newContent: "Edited", editedAt: Date())

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].content, "Edited")
        XCTAssertTrue(fetched[0].isEdited)
    }

    func test_markDeleted_clearsContentAndSetsTimestamp() async throws {
        let record = MessageRecordFactory.make(localId: "del_1", content: "Delete me")
        try await actor.insertOptimistic(record)

        try await actor.markDeleted(localId: "del_1", deletedAt: Date())

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertNil(fetched[0].content)
        XCTAssertNotNil(fetched[0].deletedAt)
    }

    // MARK: - Reactions

    func test_updateReactions_persistsJsonAndCount() async throws {
        let record = MessageRecordFactory.make(localId: "react_1")
        try await actor.insertOptimistic(record)

        let reactionsJson = try JSONEncoder().encode(["reaction1": 3, "reaction2": 1])
        try await actor.updateReactions(localId: "react_1", reactionsJson: reactionsJson,
                                         reactionCount: 4, currentUserReactionsJson: nil)

        let fetched = try actor.messages(for: "conv_default", limit: 10)
        XCTAssertEqual(fetched[0].reactionCount, 4)
        XCTAssertNotNil(fetched[0].reactionsJson)
    }

    // MARK: - Concurrent Safety

    func test_100ConcurrentInserts_noCorruption() async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            for i in 0..<100 {
                group.addTask {
                    let record = MessageRecordFactory.make(
                        localId: "concurrent_\(i)", conversationId: "conv_stress")
                    try await self.actor.insertOptimistic(record)
                }
            }
            try await group.waitForAll()
        }

        let all = try actor.messages(for: "conv_stress", limit: 200)
        XCTAssertEqual(all.count, 100)
    }
}
