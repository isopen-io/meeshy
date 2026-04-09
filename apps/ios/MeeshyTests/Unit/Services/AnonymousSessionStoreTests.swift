import XCTest
@testable import Meeshy
import MeeshySDK

final class AnonymousSessionStoreTests: XCTestCase {

    func test_save_thenLoad_returnsContext() {
        let ctx = makeContext()
        defer { AnonymousSessionStore.delete(linkId: ctx.linkId) }
        AnonymousSessionStore.save(ctx)
        let loaded = AnonymousSessionStore.load(linkId: ctx.linkId)
        XCTAssertEqual(loaded?.sessionToken, ctx.sessionToken)
        XCTAssertEqual(loaded?.participantId, ctx.participantId)
        XCTAssertEqual(loaded?.linkId, ctx.linkId)
        XCTAssertEqual(loaded?.conversationId, ctx.conversationId)
    }

    func test_save_differentLinkIds_returnsCorrectContext() {
        let id1 = "link_a_\(UUID().uuidString)"
        let id2 = "link_b_\(UUID().uuidString)"
        defer {
            AnonymousSessionStore.delete(linkId: id1)
            AnonymousSessionStore.delete(linkId: id2)
        }
        let ctx1 = makeContext(linkId: id1, token: "token-aaa")
        let ctx2 = makeContext(linkId: id2, token: "token-bbb")
        AnonymousSessionStore.save(ctx1)
        AnonymousSessionStore.save(ctx2)
        XCTAssertEqual(AnonymousSessionStore.load(linkId: id1)?.sessionToken, "token-aaa")
        XCTAssertEqual(AnonymousSessionStore.load(linkId: id2)?.sessionToken, "token-bbb")
    }

    func test_delete_removesFromKeychain() {
        let ctx = makeContext()
        AnonymousSessionStore.save(ctx)
        AnonymousSessionStore.delete(linkId: ctx.linkId)
        XCTAssertNil(AnonymousSessionStore.load(linkId: ctx.linkId))
    }

    func test_load_missingKey_returnsNil() {
        let result = AnonymousSessionStore.load(linkId: "does_not_exist_\(UUID().uuidString)")
        XCTAssertNil(result)
    }

    // MARK: - Overwrite

    func test_save_sameKeyTwice_overwritesPrevious() {
        let id = "overwrite_\(UUID().uuidString)"
        defer { AnonymousSessionStore.delete(linkId: id) }

        let ctx1 = makeContext(linkId: id, token: "token-first")
        let ctx2 = makeContext(linkId: id, token: "token-second")

        AnonymousSessionStore.save(ctx1)
        AnonymousSessionStore.save(ctx2)

        let loaded = AnonymousSessionStore.load(linkId: id)
        XCTAssertEqual(loaded?.sessionToken, "token-second")
    }

    // MARK: - Delete Non-Existent

    func test_delete_nonExistentKey_doesNotCrash() {
        AnonymousSessionStore.delete(linkId: "non_existent_\(UUID().uuidString)")
    }

    // MARK: - Context Fields

    func test_load_preservesAllFields() {
        let id = "fields_\(UUID().uuidString)"
        defer { AnonymousSessionStore.delete(linkId: id) }

        let ctx = AnonymousSessionContext(
            sessionToken: "tok-123",
            participantId: "part-456",
            permissions: .defaultAnonymous,
            linkId: id,
            conversationId: "conv-789"
        )

        AnonymousSessionStore.save(ctx)
        let loaded = AnonymousSessionStore.load(linkId: id)

        XCTAssertEqual(loaded?.sessionToken, "tok-123")
        XCTAssertEqual(loaded?.participantId, "part-456")
        XCTAssertEqual(loaded?.linkId, id)
        XCTAssertEqual(loaded?.conversationId, "conv-789")
        XCTAssertTrue(loaded?.permissions.canSendMessages ?? false)
        XCTAssertFalse(loaded?.permissions.canSendFiles ?? true)
    }

    // MARK: - Save Return Value

    func test_save_returnsTrue() {
        let ctx = makeContext()
        defer { AnonymousSessionStore.delete(linkId: ctx.linkId) }
        let result = AnonymousSessionStore.save(ctx)
        XCTAssertTrue(result)
    }

    // MARK: - Factory

    private func makeContext(
        linkId: String? = nil,
        token: String = "test-session-token"
    ) -> AnonymousSessionContext {
        let id = linkId ?? "test_link_\(UUID().uuidString)"
        return AnonymousSessionContext(
            sessionToken: token,
            participantId: "participant_\(id)",
            permissions: .defaultAnonymous,
            linkId: id,
            conversationId: "conv_\(id)"
        )
    }
}
