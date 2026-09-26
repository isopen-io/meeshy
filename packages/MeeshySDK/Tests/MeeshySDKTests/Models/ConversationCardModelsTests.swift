import XCTest
@testable import MeeshySDK

/// #8099 — la carte de conversation se décode sur le JSON du contrat, et la
/// règle des actions choisit Rejoindre / Quitter | Ouvrir / rien.
final class ConversationCardModelsTests: XCTestCase {

    private func decode(_ json: String) throws -> ConversationCard {
        let envelope = try JSONDecoder().decode(APIResponse<ConversationCard>.self, from: Data(json.utf8))
        return envelope.data
    }

    private static let shareLinkJSON = """
    {"success":true,"data":{
      "kind":"share-link","conversationId":null,"title":"Club de lecture",
      "description":"On lit un roman par mois.","avatarUrl":"https://cdn.meeshy.me/a.jpg",
      "bannerUrl":null,"conversationType":"group",
      "stats":{"memberCount":42,"onlineCount":null,"messageCount":null,"languages":["fr","en"]},
      "viewer":{"isMember":false,"canJoin":true,"requiresAccount":false,"canJoinAnonymously":true},
      "link":{"identifier":"mshy_club","isActive":true,"expiresAt":"2026-12-31T00:00:00.000Z"},
      "inviter":{"displayName":"Priya Nair","username":"priya","avatarUrl":null},
      "inviteMessage":"Viens, on commence Dune."
    }}
    """

    func test_decode_shareLinkContract_readsEveryField() throws {
        let card = try decode(Self.shareLinkJSON)
        XCTAssertEqual(card.kind, .shareLink)
        XCTAssertNil(card.conversationId)
        XCTAssertEqual(card.title, "Club de lecture")
        XCTAssertEqual(card.stats.memberCount, 42)
        XCTAssertNil(card.stats.messageCount)
        XCTAssertEqual(card.stats.languages, ["fr", "en"])
        XCTAssertTrue(card.viewer.canJoinAnonymously)
        XCTAssertEqual(card.link?.identifier, "mshy_club")
        XCTAssertEqual(card.inviter?.displayName, "Priya Nair")
        XCTAssertEqual(card.inviteMessage, "Viens, on commence Dune.")
    }

    func test_decode_firstContractWithoutInviterFields_defaultsThem() throws {
        let card = try decode("""
        {"success":true,"data":{"kind":"direct","conversationId":"c1","title":"Équipe",
        "description":null,"avatarUrl":null,"bannerUrl":null,"conversationType":"group",
        "stats":{"memberCount":3,"onlineCount":null,"messageCount":120,"languages":[]},
        "viewer":{"isMember":true,"canJoin":false,"requiresAccount":false},"link":null}}
        """)
        XCTAssertEqual(card.kind, .direct)
        XCTAssertFalse(card.viewer.canJoinAnonymously)
        XCTAssertNil(card.inviter)
        XCTAssertNil(card.inviteMessage)
        XCTAssertEqual(card.stats.messageCount, 120)
    }

    func test_resolveActions_nonMemberOnActiveShareLink_joinsWithAnonymousOption() throws {
        let card = try decode(Self.shareLinkJSON)
        XCTAssertEqual(ConversationCardActions.resolve(for: card, target: .shareLink(identifier: "mshy_club")),
                       .join(identifier: "mshy_club", allowsAnonymous: true))
    }

    func test_resolveActions_member_leavesOrOpens() {
        let card = Self.card(kind: .direct, conversationId: "c1", isMember: true, link: nil)
        XCTAssertEqual(ConversationCardActions.resolve(for: card, target: .direct(conversationId: "c1")),
                       .leaveOrOpen(conversationId: "c1"))
    }

    func test_resolveActions_memberWithoutServedId_usesDirectTarget() {
        let card = Self.card(kind: .direct, conversationId: nil, isMember: true, link: nil)
        XCTAssertEqual(ConversationCardActions.resolve(for: card, target: .direct(conversationId: "c9")),
                       .leaveOrOpen(conversationId: "c9"))
    }

    func test_resolveActions_expiredLink_offersNothing() {
        let card = Self.card(kind: .shareLink, conversationId: nil, isMember: false,
                             link: ConversationCardLink(identifier: "x", isActive: false, expiresAt: nil))
        XCTAssertTrue(card.isLinkExpired)
        XCTAssertEqual(ConversationCardActions.resolve(for: card, target: .shareLink(identifier: "x")), .none)
    }

    func test_resolveActions_nonMemberOnDirectCard_offersNothing() {
        let card = Self.card(kind: .direct, conversationId: "c1", isMember: false, link: nil)
        XCTAssertEqual(ConversationCardActions.resolve(for: card, target: .direct(conversationId: "c1")), .none)
    }

    func test_with_isMember_flipsActionsToLeaveOrOpen() {
        let card = Self.card(kind: .shareLink, conversationId: nil, isMember: false,
                             link: ConversationCardLink(identifier: "x", isActive: true, expiresAt: nil))
        let joined = card.with(isMember: true, conversationId: "c7")
        XCTAssertEqual(ConversationCardActions.resolve(for: joined, target: .shareLink(identifier: "x")),
                       .leaveOrOpen(conversationId: "c7"))
        let left = joined.with(isMember: false, conversationId: nil)
        XCTAssertEqual(ConversationCardActions.resolve(for: left, target: .shareLink(identifier: "x")),
                       .join(identifier: "x", allowsAnonymous: false))
    }

    static func card(kind: ConversationCardKind, conversationId: String?, isMember: Bool,
                     link: ConversationCardLink?) -> ConversationCard {
        ConversationCard(
            kind: kind, conversationId: conversationId, title: "Titre", description: nil,
            avatarUrl: nil, bannerUrl: nil, conversationType: "group",
            stats: ConversationCardStats(memberCount: 2, messageCount: nil, languages: []),
            viewer: ConversationCardViewer(isMember: isMember, canJoin: !isMember && kind == .shareLink,
                                           requiresAccount: false, canJoinAnonymously: false),
            link: link
        )
    }
}
