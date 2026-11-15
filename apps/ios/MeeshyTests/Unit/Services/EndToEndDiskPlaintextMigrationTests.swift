import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Le clair qu'une version antérieure a écrit hors du coffre s'en va au
/// lancement (#12999) : la ligne, l'aperçu, le cache du fil, le brouillon et le
/// favori d'un message chiffré de bout en bout.
@MainActor
final class EndToEndDiskPlaintextMigrationTests: XCTestCase {
    private let me = "00000000000000000000aa11"
    private let conversationId = "00000000000000000000ab77"
    private let secret = "le clair laissé par une version antérieure"

    private struct Fixture {
        let migration: EndToEndDiskPlaintextMigration
        let endToEnd: MockEndToEndMessaging
        let pool: DatabaseQueue
        let drafts: DraftStore
        let starred: StarredMessagesStore
        let defaults: UserDefaults
    }

    private func makeFixture() async throws -> Fixture {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool, currentUserId: me)
        var legacy = OptimisticTextRecordBuilder.record(
            localId: "cid_1", conversationId: conversationId, senderId: me, sender: nil, text: secret,
            originalLanguage: "fr", messageType: "text", replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil, replyToJson: nil, effectFlags: 0,
            maxViewOnceCount: nil, locationJson: nil, stickerJson: nil, sealedEndToEnd: false,
            now: Date(), ephemeralDuration: nil
        )
        legacy.serverId = "srv_1"
        let legacyRow = legacy
        try await pool.write { db in try legacyRow.insert(db) }

        let endToEnd = MockEndToEndMessaging()
        endToEnd.store(.readable(
            E2EEContent(text: secret, language: "fr", replyTo: nil, conversationId: conversationId, clientMessageId: "cid_1", sentAt: Date()),
            senderUserId: me
        ), for: "srv_1")

        let suite = "e2ee-disk-migration-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let drafts = DraftStore(userDefaults: defaults, userIdProvider: { [me] in me })
        drafts.save(MessageDraft.composing(text: secret, reply: nil), for: conversationId)
        let starred = StarredMessagesStore(userDefaults: defaults)
        _ = starred.toggle(StarredMessageSnapshot(
            id: "srv_1", conversationId: conversationId, conversationName: nil, conversationAccentColor: nil,
            senderUserId: nil, senderName: "Moi", contentPreview: secret, attachmentKind: nil,
            starredAt: Date(), sentAt: Date()
        ))

        var row = Conversation(id: conversationId, identifier: conversationId, type: .direct, title: "Bob",
                               lastMessageAt: Date(), encryptionMode: E2EEWire.mode)
        row.applyLastMessage(LastMessageFacet.sent(id: "srv_1", text: secret, at: Date()))
        try await CacheCoordinator.shared.conversations.save([row], for: "list")
        try await CacheCoordinator.shared.messages.save(
            [MeeshyMessage(id: "srv_1", conversationId: conversationId, senderId: me, content: secret)], for: conversationId
        )

        let migration = EndToEndDiskPlaintextMigration(
            endToEnd: endToEnd, rows: { persistence.endToEndRowSealer }, drafts: drafts, defaults: defaults, starred: { starred }
        )
        return Fixture(migration: migration, endToEnd: endToEnd, pool: pool, drafts: drafts, starred: starred, defaults: defaults)
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
    }

    func test_run_sealsTheRow_theListPreview_theThreadCache_theDraft_andTheStar() async throws {
        let fixture = try await makeFixture()

        await fixture.migration.run(for: me)

        let contents = try await fixture.pool.read { db in try String.fetchAll(db, sql: "SELECT content FROM messages") }
        XCTAssertEqual(contents, [E2EEWire.contentPlaceholder])
        let list = await CacheCoordinator.shared.conversations.loadIgnoringExpiry(for: "list")?.items ?? []
        XCTAssertNil(list.first?.lastMessagePreview)
        XCTAssertEqual(list.first?.lastMessageNature?.isEncrypted, true)
        let thread = await CacheCoordinator.shared.messages.loadIgnoringExpiry(for: conversationId)?.items ?? []
        XCTAssertFalse(thread.contains { $0.content == secret })
        XCTAssertNil(fixture.drafts.load(for: conversationId))
        XCTAssertEqual(fixture.starred.snapshot(for: "srv_1")?.contentPreview, StarredSnapshotFactory.sealedPreview)
    }

    func test_run_onAVaultThatIsNotTheAccounts_touchesNothing_andRetriesNextTime() async throws {
        let fixture = try await makeFixture()
        fixture.endToEnd.vaultAccount = "00000000000000000000cc33"

        await fixture.migration.run(for: me)

        let contents = try await fixture.pool.read { db in try String.fetchAll(db, sql: "SELECT content FROM messages") }
        XCTAssertEqual(contents, [secret])
        XCTAssertFalse(fixture.defaults.bool(forKey: EndToEndDiskPlaintextMigration.doneKeyPrefix + me))
    }
}
