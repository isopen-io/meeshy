import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class GuestSessionTests: XCTestCase {

    // MARK: - GuestSession

    func test_guestSession_withoutContext_contextIsNil() {
        let session = GuestSession(identifier: "link123", context: nil)

        XCTAssertEqual(session.identifier, "link123")
        XCTAssertNil(session.context)
    }

    func test_guestSession_withContext_contextIsSet() {
        let ctx = makeContext()
        let session = GuestSession(identifier: "link123", context: ctx)

        XCTAssertEqual(session.identifier, "link123")
        XCTAssertEqual(session.context?.conversationId, "conv456")
        XCTAssertEqual(session.context?.sessionToken, "tok_abc")
    }

    // MARK: - AnonymousSessionStore round-trip

    func test_sessionStore_saveAndLoad_roundTrips() {
        let ctx = makeContext(linkId: "test_roundtrip")
        defer { AnonymousSessionStore.delete(linkId: "test_roundtrip") }

        let saved = AnonymousSessionStore.save(ctx)
        let loaded = AnonymousSessionStore.load(linkId: "test_roundtrip")

        XCTAssertTrue(saved)
        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.sessionToken, ctx.sessionToken)
        XCTAssertEqual(loaded?.conversationId, ctx.conversationId)
        XCTAssertEqual(loaded?.participantId, ctx.participantId)
        XCTAssertEqual(loaded?.linkId, "test_roundtrip")
    }

    func test_sessionStore_delete_removesEntry() {
        let ctx = makeContext(linkId: "test_delete")

        AnonymousSessionStore.save(ctx)
        AnonymousSessionStore.delete(linkId: "test_delete")
        let loaded = AnonymousSessionStore.load(linkId: "test_delete")

        XCTAssertNil(loaded)
    }

    func test_sessionStore_load_nonExistentKey_returnsNil() {
        let loaded = AnonymousSessionStore.load(linkId: "nonexistent_key_\(UUID().uuidString)")

        XCTAssertNil(loaded)
    }

    // MARK: - DeepLinkRouter consumePendingDeepLink discardable

    func test_consumePendingDeepLink_canBeCalledWithoutCapture() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://meeshy.me/join/abc")!
        _ = router.handle(url: url)

        router.consumePendingDeepLink()

        XCTAssertNil(router.pendingDeepLink)
    }

    // MARK: - Helpers

    private func makeContext(
        linkId: String = "link123",
        sessionToken: String = "tok_abc",
        conversationId: String = "conv456",
        participantId: String = "part789"
    ) -> AnonymousSessionContext {
        AnonymousSessionContext(
            sessionToken: sessionToken,
            participantId: participantId,
            permissions: ParticipantPermissions(),
            linkId: linkId,
            conversationId: conversationId
        )
    }
}
