import XCTest
@testable import MeeshySDK

/// #8099 — la carte se sert cache d'abord ; un refus se cache comme verdict,
/// une panne réseau ne remplace rien.
final class ConversationCardServiceTests: XCTestCase {

    private final class Clock: @unchecked Sendable {
        var date = Date(timeIntervalSince1970: 1_000_000)
    }

    private func makeService(_ api: MockAPIClient, clock: Clock = Clock()) -> ConversationCardService {
        ConversationCardService(api: api, now: { clock.date })
    }

    private static let card = ConversationCard(
        kind: .shareLink, conversationId: nil, title: "Club", description: "d",
        avatarUrl: nil, bannerUrl: nil, conversationType: "group",
        stats: ConversationCardStats(memberCount: 4, messageCount: nil, languages: ["fr"]),
        viewer: ConversationCardViewer(isMember: false, canJoin: true, requiresAccount: false, canJoinAnonymously: false),
        link: ConversationCardLink(identifier: "abc", isActive: true, expiresAt: nil)
    )

    func test_refresh_shareLink_callsLinksCardRouteAndCaches() async {
        let api = MockAPIClient()
        api.stub("/links/abc/card", result: APIResponse(success: true, data: Self.card, error: nil))
        let service = makeService(api)

        let resolution = await service.refresh(.shareLink(identifier: "abc"))

        XCTAssertEqual(resolution, .card(Self.card))
        XCTAssertEqual(api.lastRequest?.path, "/links/abc/card")
        guard case .fresh(.card(let cached), _) = service.cached(.shareLink(identifier: "abc")) else {
            return XCTFail("la carte relue doit être en cache, fraîche")
        }
        XCTAssertEqual(cached, Self.card)
    }

    func test_refresh_direct404_cachesPrivateConversation() async {
        let api = MockAPIClient()
        api.stubError("/conversations/c1/card", error: MeeshyError.server(statusCode: 404, message: "Not found"))
        let service = makeService(api)

        let resolution = await service.refresh(.direct(conversationId: "c1"))

        XCTAssertEqual(resolution, .privateConversation)
        XCTAssertEqual(api.lastRequest?.path, "/conversations/c1/card")
        guard case .fresh(.privateConversation, _) = service.cached(.direct(conversationId: "c1")) else {
            return XCTFail("le refus d'un lien direct est un verdict caché")
        }
    }

    func test_refresh_shareLink404_isUnavailable() async {
        let api = MockAPIClient()
        api.stubError("/links/zz/card", error: MeeshyError.server(statusCode: 404, message: "Not found"))

        let resolution = await makeService(api).refresh(.shareLink(identifier: "zz"))

        XCTAssertEqual(resolution, .unavailable)
    }

    func test_refresh_networkFailureWithStaleCard_keepsTheCard() async {
        let api = MockAPIClient()
        let clock = Clock()
        let service = makeService(api, clock: clock)
        service.store(.card(Self.card), for: .shareLink(identifier: "abc"))
        clock.date = clock.date.addingTimeInterval(120)
        api.errorToThrow = MeeshyError.network(.noConnection)

        let resolution = await service.refresh(.shareLink(identifier: "abc"))

        XCTAssertEqual(resolution, .card(Self.card))
        guard case .stale = service.cached(.shareLink(identifier: "abc")) else {
            return XCTFail("une panne réseau ne réécrit pas l'horodatage")
        }
    }

    func test_refresh_networkFailureOnEmptyCache_isUnavailableAndNotCached() async {
        let api = MockAPIClient()
        api.errorToThrow = MeeshyError.network(.noConnection)
        let service = makeService(api)

        let resolution = await service.refresh(.direct(conversationId: "c1"))

        XCTAssertEqual(resolution, .unavailable)
        guard case .empty = service.cached(.direct(conversationId: "c1")) else {
            return XCTFail("une panne n'est pas un verdict")
        }
    }

    func test_cached_unavailableAfterFreshWindow_isExpired() {
        let clock = Clock()
        let service = makeService(MockAPIClient(), clock: clock)
        service.store(.unavailable, for: .shareLink(identifier: "abc"))
        clock.date = clock.date.addingTimeInterval(ConversationCardService.freshInterval + 1)

        guard case .expired = service.cached(.shareLink(identifier: "abc")) else {
            return XCTFail("un repli ne se sert jamais périmé")
        }
    }

    func test_invalidate_emptiesTheEntry() {
        let service = makeService(MockAPIClient())
        service.store(.card(Self.card), for: .shareLink(identifier: "abc"))
        service.invalidate(.shareLink(identifier: "abc"))
        guard case .empty = service.cached(.shareLink(identifier: "abc")) else {
            return XCTFail("invalidate vide l'entrée")
        }
    }

    // MARK: - #8138 — une conversation, toutes ses cartes

    private static func memberCard(kind: ConversationCardKind, conversationId: String) -> ConversationCard {
        ConversationCard(
            kind: kind, conversationId: conversationId, title: "Club", description: nil,
            avatarUrl: nil, bannerUrl: nil, conversationType: "group",
            stats: ConversationCardStats(memberCount: 2, messageCount: nil, languages: []),
            viewer: ConversationCardViewer(isMember: true, canJoin: false, requiresAccount: false, canJoinAnonymously: false),
            link: kind == .shareLink ? ConversationCardLink(identifier: "abc", isActive: true, expiresAt: nil) : nil
        )
    }

    func test_invalidateConversation_directPrivateCard_isEmptiedByAJoinThroughTheShareLink() {
        let service = makeService(MockAPIClient())
        service.store(.privateConversation, for: .direct(conversationId: "c1"))
        service.invalidate(conversationId: "c1", from: .shareLink(identifier: "abc"))
        guard case .empty = service.cached(.direct(conversationId: "c1")) else {
            return XCTFail("la carte directe « privée » d'une conversation rejointe doit être relue")
        }
    }

    func test_invalidateConversation_shareLinkMemberCard_isEmptiedByALeaveThroughTheDirectLink() {
        let service = makeService(MockAPIClient())
        service.store(.card(Self.memberCard(kind: .shareLink, conversationId: "c1")), for: .shareLink(identifier: "abc"))
        service.invalidate(conversationId: "c1", from: .direct(conversationId: "c1"))
        guard case .empty = service.cached(.shareLink(identifier: "abc")) else {
            return XCTFail("la carte de partage « membre » d'une conversation quittée doit être relue")
        }
    }

    func test_invalidateConversation_otherConversations_areKept() {
        let service = makeService(MockAPIClient())
        service.store(.privateConversation, for: .direct(conversationId: "c2"))
        service.store(.card(Self.memberCard(kind: .shareLink, conversationId: "c2")), for: .shareLink(identifier: "zz"))
        service.invalidate(conversationId: "c1", from: .direct(conversationId: "c1"))
        guard case .fresh = service.cached(.direct(conversationId: "c2")),
              case .fresh = service.cached(.shareLink(identifier: "zz")) else {
            return XCTFail("les cartes d'une AUTRE conversation ne bougent pas")
        }
    }

    func test_invalidateConversation_announcesTheChangeWithItsOrigin() {
        let service = makeService(MockAPIClient())
        let posted = expectation(forNotification: ConversationCardChange.notification, object: nil) { note in
            (note.object as? ConversationCardChange) == ConversationCardChange(
                conversationId: "c1", origin: .shareLink(identifier: "abc")
            )
        }
        service.invalidate(conversationId: "c1", from: .shareLink(identifier: "abc"))
        wait(for: [posted], timeout: 1)
    }
}
