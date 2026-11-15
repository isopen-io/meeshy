import XCTest
@testable import Meeshy
import MeeshySDK

/// **Aucune porte ne reste muette** (#7811).
///
/// Un lien de communauté partait dans Safari, le widget « Non lus » et
/// l'App Shortcut « Open Recent Conversation » ouvraient l'accueil sans rien
/// de ce qu'ils annoncent, et un lien de contenu reçu sans compte laissait
/// l'écran de connexion muet sur ce qui l'attendait.
@MainActor
final class SilentDoorsTests: XCTestCase {

    // MARK: - Communauté

    func test_parse_webUrl_community_returnsCommunity() {
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "https://meeshy.me/communities/cm1")!), .community(id: "cm1"))
    }

    /// `/communities/new` est l'écran de CRÉATION du web, pas une communauté.
    func test_parse_webUrl_communitiesNew_isExternal() {
        let url = URL(string: "https://meeshy.me/communities/new")!
        XCTAssertEqual(DeepLinkParser.parse(url), .external(url))
    }

    func test_parse_customScheme_community_returnsCommunity() {
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "meeshy://community/cm2")!), .community(id: "cm2"))
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "meeshy://communities/cm3")!), .community(id: "cm3"))
    }

    func test_handle_community_universalAndCustomScheme_setPendingCommunity() {
        let web = DeepLinkRouter()
        XCTAssertTrue(web.handle(url: URL(string: "https://meeshy.me/communities/cm4")!))
        XCTAssertEqual(web.pendingDeepLink, .community(id: "cm4"))

        let scheme = DeepLinkRouter()
        XCTAssertTrue(scheme.handle(url: URL(string: "meeshy://community/cm5")!))
        XCTAssertEqual(scheme.pendingDeepLink, .community(id: "cm5"))
    }

    func test_handle_communitiesNew_isRefused() {
        let sut = DeepLinkRouter()
        XCTAssertFalse(sut.handle(url: URL(string: "https://meeshy.me/communities/new")!))
        XCTAssertNil(sut.pendingDeepLink)
    }

    func test_destinationForOriginalURL_community_returnsCommunity() {
        XCTAssertEqual(
            DeepLinkRouter.destination(forOriginalURL: URL(string: "https://meeshy.me/communities/cm6")!),
            .community(id: "cm6"))
    }

    // MARK: - Widgets / App Shortcut

    func test_parse_conversationsUnread_returnsUnreadConversations() {
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "meeshy://conversations/unread")!), .unreadConversations)
    }

    func test_parse_conversationsRecent_returnsRecentConversation() {
        XCTAssertEqual(DeepLinkParser.parse(URL(string: "meeshy://conversations/recent")!), .recentConversation)
    }

    func test_handle_conversationsHosts_setPendingDestinations() {
        let unread = DeepLinkRouter()
        XCTAssertTrue(unread.handle(url: URL(string: "meeshy://conversations/unread")!))
        XCTAssertEqual(unread.pendingDeepLink, .unreadConversations)

        let recent = DeepLinkRouter()
        XCTAssertTrue(recent.handle(url: URL(string: "meeshy://conversations/recent")!))
        XCTAssertEqual(recent.pendingDeepLink, .recentConversation)
    }

    /// « Non lus » ouvre la liste sur le MÊME filtre que la puce du même nom.
    func test_unreadFilter_isTheChipSelection() {
        XCTAssertEqual(ConversationListEntry.unreadFilters,
                       ConversationFilterComposition.toggling(.unread, in: ConversationFilterComposition.neutral))
    }

    /// « Récente » : la conversation au dernier message le plus récent, jamais
    /// une archivée — qu'on l'ait archivée soi-même ou qu'elle soit fermée.
    func test_recentConversation_electsTheLatestActivity_skippingArchives() {
        let now = Date()
        let older = makeConversation(id: "c-old", lastMessageAt: now.addingTimeInterval(-3600))
        let latest = makeConversation(id: "c-new", lastMessageAt: now.addingTimeInterval(-60))
        let archived = makeConversation(id: "c-arch", lastMessageAt: now, isArchivedByUser: true)
        let closed = makeConversation(id: "c-closed", lastMessageAt: now, isActive: false)

        XCTAssertEqual(ConversationListEntry.recentConversationId(in: [older, archived, latest, closed]), "c-new")
    }

    func test_recentConversation_withNoConversation_isNil() {
        XCTAssertNil(ConversationListEntry.recentConversationId(in: []))
    }

    // MARK: - Sans compte

    /// Un lien de CONTENU reçu sans compte attend la connexion, et l'écran de
    /// connexion le dit ; un lien qui s'ouvre sans compte (invitation, lien
    /// magique, lien externe) ou qui a échoué n'annonce rien.
    func test_opensAfterSignIn_contentLinksOnly() {
        let waiting: [DeepLink] = [
            .postDetail(postId: "p"), .storyDetail(postId: "s"), .reel(postId: "r"),
            .userProfile(username: "u"), .community(id: "c"), .conversation(id: "cv"),
            .hashtag(tag: "t"), .trackedLink(token: "tk"), .recentConversation, .unreadConversations
        ]
        let notWaiting: [DeepLink] = [
            .joinLink(identifier: "j"), .chatLink(identifier: "c"), .magicLink(token: "m"),
            .externalLink(url: URL(string: "https://example.com")!), .unresolvedTrackedLink(token: "x")
        ]
        waiting.forEach { XCTAssertTrue($0.opensAfterSignIn, "\($0) attend la connexion") }
        notWaiting.forEach { XCTAssertFalse($0.opensAfterSignIn, "\($0) n'attend pas la connexion") }
    }

    // MARK: - Fabrique

    private func makeConversation(id: String, lastMessageAt: Date, isArchivedByUser: Bool = false,
                                  isActive: Bool = true) -> Conversation {
        Conversation(id: id, identifier: id, type: .direct, title: id, isActive: isActive,
                     lastMessageAt: lastMessageAt, isArchivedByUser: isArchivedByUser)
    }
}
