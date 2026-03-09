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
