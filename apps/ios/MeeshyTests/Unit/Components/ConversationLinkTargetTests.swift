import XCTest
import MeeshySDK
@testable import Meeshy

/// #8099 — quelles URL d'un message deviennent une carte de conversation.
@MainActor
final class ConversationLinkTargetTests: XCTestCase {

    func test_target_chatShareLink_isShareLink() {
        XCTAssertEqual(ConversationLinkTarget.target(for: "https://meeshy.me/chat/mshy_club"),
                       .shareLink(identifier: "mshy_club"))
    }

    func test_target_joinInvitationLink_isShareLink() {
        XCTAssertEqual(ConversationLinkTarget.target(for: "https://meeshy.me/join/abc123"),
                       .shareLink(identifier: "abc123"))
    }

    func test_target_customSchemeJoin_isShareLink() {
        XCTAssertEqual(ConversationLinkTarget.target(for: "meeshy://join/abc123"),
                       .shareLink(identifier: "abc123"))
    }

    func test_target_wwwHostChat_isShareLink() {
        XCTAssertEqual(ConversationLinkTarget.target(for: "https://www.meeshy.me/chat/abc"),
                       .shareLink(identifier: "abc"))
    }

    func test_target_directConversationRoute_isDirect() {
        XCTAssertEqual(ConversationLinkTarget.target(for: "https://meeshy.me/c/64f1a2b3c4d5e6f708192a3b"),
                       .direct(conversationId: "64f1a2b3c4d5e6f708192a3b"))
    }

    func test_target_longConversationRoute_isDirect() {
        XCTAssertEqual(ConversationLinkTarget.target(for: "https://meeshy.me/conversation/c1"),
                       .direct(conversationId: "c1"))
    }

    func test_target_customSchemeConversation_isDirect() {
        XCTAssertEqual(ConversationLinkTarget.target(for: "meeshy://c/c1"), .direct(conversationId: "c1"))
    }

    func test_target_trackedLink_isNotAConversation() {
        XCTAssertNil(ConversationLinkTarget.target(for: "https://meeshy.me/l/Ab3xYz"))
    }

    func test_target_widgetShortcuts_areNotCards() {
        XCTAssertNil(ConversationLinkTarget.target(for: "meeshy://contact/c1"))
        XCTAssertNil(ConversationLinkTarget.target(for: "meeshy://quickreply/c1?text=salut"))
        XCTAssertNil(ConversationLinkTarget.target(for: "meeshy://send?contactId=c1&message=salut"))
    }

    func test_target_otherMeeshyRoutes_areNotConversations() {
        XCTAssertNil(ConversationLinkTarget.target(for: "https://meeshy.me/post/p1"))
        XCTAssertNil(ConversationLinkTarget.target(for: "https://meeshy.me/u/priya"))
    }

    func test_target_foreignHosts_areRejected() {
        XCTAssertNil(ConversationLinkTarget.target(for: "https://evil.example/chat/abc"))
        XCTAssertNil(ConversationLinkTarget.target(for: "https://meeshy.me.evil.example/c/c1"))
        XCTAssertNil(ConversationLinkTarget.target(for: "https://example.com/join/abc"))
    }

    func test_target_emptyIdentifier_isRejected() {
        XCTAssertNil(ConversationLinkTarget.target(for: "https://meeshy.me/chat/"))
        XCTAssertNil(ConversationLinkTarget.target(for: "https://meeshy.me/c/%20"))
    }
}
