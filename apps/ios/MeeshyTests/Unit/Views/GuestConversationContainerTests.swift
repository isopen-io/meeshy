import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

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

/// #10206 — « Partager » transmet l'adresse publique `/chat/<lien>` : celle
/// par laquelle l'invité est entré, ou celle que `GET /world` sert pour World
/// Wide. Rien n'est écrit en dur.
@MainActor
final class ConversationShareTargetTests: XCTestCase {

    private let world = WorldEntry(identifier: "world", title: "World Wide", shareLinkIdentifier: "mshy_world", memberCount: 3)

    func test_url_guest_sharesTheLinkItEnteredBy() {
        let url = ConversationShareTarget.url(
            conversation: Conversation(id: "c1", identifier: "c1", type: .group),
            guestLinkId: "mshy_abc",
            world: nil,
            webOrigin: "https://staging.meeshy.me"
        )
        XCTAssertEqual(url?.absoluteString, "https://staging.meeshy.me/chat/mshy_abc")
    }

    func test_url_memberOfWorldWide_sharesTheServedWorldLink() {
        let url = ConversationShareTarget.url(
            conversation: Conversation(id: "c1", identifier: "world", type: .global),
            guestLinkId: nil,
            world: world,
            webOrigin: "https://meeshy.me"
        )
        XCTAssertEqual(url?.absoluteString, "https://meeshy.me/chat/mshy_world")
    }

    func test_url_anotherGlobalConversation_offersNoShare() {
        XCTAssertNil(ConversationShareTarget.url(
            conversation: Conversation(id: "c2", identifier: "meeshy", type: .global),
            guestLinkId: "",
            world: world,
            webOrigin: "https://meeshy.me"
        ))
    }

    func test_url_conversationWithoutPublicLink_offersNoShare() {
        XCTAssertNil(ConversationShareTarget.url(
            conversation: Conversation(id: "c1", identifier: "team", type: .group),
            guestLinkId: nil,
            world: world,
            webOrigin: "https://meeshy.me"
        ))
    }

    func test_url_linkKeyIsPercentEncodedAsOnePathSegment() {
        let url = ConversationShareTarget.url(conversation: nil, guestLinkId: "a b/c", world: nil, webOrigin: "https://meeshy.me")
        XCTAssertEqual(url?.absoluteString, "https://meeshy.me/chat/a%20b%2Fc")
    }

    func test_needsWorldEntry_onlyForAMemberOfAGlobalConversation() {
        XCTAssertTrue(ConversationShareTarget.needsWorldEntry(conversation: Conversation(id: "c", identifier: "world", type: .global), guestLinkId: nil))
        XCTAssertFalse(ConversationShareTarget.needsWorldEntry(conversation: Conversation(id: "c", identifier: "g", type: .group), guestLinkId: nil))
        XCTAssertFalse(ConversationShareTarget.needsWorldEntry(conversation: Conversation(id: "c", identifier: "world", type: .global), guestLinkId: "mshy_world"))
    }
}

/// #10205 — un invité sans compte n'ouvre aucune fiche : le routeur de son
/// fil refuse toute fiche, quelle que soit la porte qui la demande.
@MainActor
final class GuestRouterProfileRefusalTests: XCTestCase {

    func test_guestRouter_refusesAnAccountProfile_whateverTheDoor() {
        let router = Router(refusesProfiles: true)
        router.deepLinkProfileUser = ProfileSheetUser(username: "alice")
        router.openProfile(ProfileSheetUser(username: "bob"), inConversation: "c1")
        XCTAssertNil(router.deepLinkProfileUser)
    }

    func test_guestRouter_refusesAParticipantProfile() {
        let router = Router(refusesProfiles: true)
        router.participantProfileTarget = ParticipantProfileTarget(conversationId: "c1", participantId: "p1")
        XCTAssertNil(router.participantProfileTarget)
    }

    func test_memberRouter_stillOpensProfiles() {
        let router = Router()
        router.openProfile(ProfileSheetUser(username: "bob"), inConversation: "c1")
        XCTAssertEqual(router.deepLinkProfileUser?.username, "bob")
    }
}
