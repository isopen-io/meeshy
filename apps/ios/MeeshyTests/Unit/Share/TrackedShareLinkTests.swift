import XCTest
@testable import Meeshy
@testable import MeeshySDK
import MeeshyUI

/// « Envoyer » et « Partager » créent tous deux le lien suivi de l'utilisateur
/// (#14310, #14311) — une seule frappe, une seule loi d'audience.
@MainActor
final class TrackedShareLinkTests: XCTestCase {

    private func card(_ subject: ShareSubject) -> ShareCard {
        guard case .card(let card) = subject else { fatalError("une carte attendue") }
        return card
    }

    private func story(visibility: String?) -> StoryItem {
        StoryItem(id: "s1", content: "story", media: [], storyEffects: nil,
                  createdAt: Date(), expiresAt: nil, visibility: visibility, isViewed: false)
    }

    private func group() -> StoryGroup {
        StoryGroup(id: "author", username: "moussa", avatarColor: "FF2E63", stories: [])
    }

    // MARK: - La loi d'audience

    func test_mintsTrackedLink_forPostsReelsAndPublicStoriesOnly() {
        XCTAssertTrue(card(.publication(id: "p", isReel: false, authorName: "a")).mintsTrackedLink)
        XCTAssertTrue(card(.publication(id: "p", isReel: true, authorName: "a")).mintsTrackedLink)
        XCTAssertTrue(card(.story(id: "s", authorName: "a", isPublic: true)).mintsTrackedLink)
        XCTAssertFalse(card(.story(id: "s", authorName: "a", isPublic: false)).mintsTrackedLink,
                       "Un lien /l/ s'ouvre sans compte : une story non publique n'en reçoit pas.")
    }

    func test_publication_pointsAtThePostDetail_withItsKind() {
        let reel = card(.publication(id: "p9", isReel: true, authorName: "a"))
        XCTAssertEqual(reel.kind, .reel)
        XCTAssertEqual(reel.url?.absoluteString, "https://meeshy.me/feeds/post/p9")
        XCTAssertEqual(card(.publication(id: "p9", isReel: false, authorName: "a")).kind, .post)
    }

    // MARK: - La frappe

    func test_mint_asksTheGatewayForTheUsersLink_taggedByGesture() async {
        let service = MockPostService()

        let url = await TrackedShareLink.mint(for: card(.publication(id: "p1", isReel: true, authorName: "a")),
                                              gesture: .shareOut, service: service, isOnline: true)

        XCTAssertEqual(url?.absoluteString, "https://meeshy.me/l/mock123")
        XCTAssertEqual(service.lastSharePostId, "p1")
        XCTAssertEqual(service.lastShareGenerateLink, true)
        XCTAssertEqual(service.lastSharePlatform, "system")
    }

    func test_mint_neverCallsTheGateway_forAPrivateStory_orOffline() async {
        let service = MockPostService()

        let privateStory = await TrackedShareLink.mint(for: card(.story(id: "s", authorName: "a", isPublic: false)),
                                                       gesture: .send, service: service, isOnline: true)
        let offline = await TrackedShareLink.mint(for: card(.publication(id: "p", isReel: false, authorName: "a")),
                                                  gesture: .send, service: service, isOnline: false)

        XCTAssertNil(privateStory)
        XCTAssertNil(offline)
        XCTAssertEqual(service.shareCallCount, 0)
    }

    func test_outgoingURL_fallsBackToTheDirectAddress_whenTheGatewayFails() async {
        let service = MockPostService()
        service.shareResult = .failure(URLError(.notConnectedToInternet))

        let url = await TrackedShareLink.outgoingURL(for: card(.publication(id: "p1", isReel: false, authorName: "a")),
                                                     service: service, isOnline: true)

        XCTAssertEqual(url?.absoluteString, "https://meeshy.me/feeds/post/p1")
    }

    // MARK: - « Partager » d'une story (menu ⋯)

    func test_storyOutsideShare_publicStory_carriesTheTrackedLink_toTheSystemSheet() async {
        let service = MockPostService()

        let wrapper = await StoryOutsideShare.wrapper(story: story(visibility: "PUBLIC"), group: group(),
                                                      service: service, isOnline: true)

        XCTAssertEqual(wrapper?.outgoing?.url.absoluteString, "https://meeshy.me/l/mock123")
        XCTAssertEqual(service.shareCallCount, 1)
    }

    func test_storyOutsideShare_privateStory_sharesItsDirectAddress_withoutMinting() async {
        let service = MockPostService()

        let wrapper = await StoryOutsideShare.wrapper(story: story(visibility: "FRIENDS"), group: group(),
                                                      service: service, isOnline: true)

        XCTAssertEqual(wrapper?.outgoing?.url.absoluteString, "https://meeshy.me/story/s1")
        XCTAssertEqual(service.shareCallCount, 0)
    }
}

/// Le rail du lecteur de réels porte « Envoyer », qui ouvre la feuille Meeshy (#14310).
final class ReelRailSendWiringGuardTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: path)
    }

    func test_theReelRail_offersSend_andThePlayerPresentsTheMeeshySheet() throws {
        let rail = try source("Meeshy/Features/Main/Views/ReelsPlayerView+ActionRail.swift")
        XCTAssertTrue(rail.contains("\"reels.action.send\""))
        XCTAssertTrue(rail.contains("action: onSend"))

        let player = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        XCTAssertTrue(player.contains("ReelSend.open(reel)"))
        XCTAssertTrue(player.contains(".modifier(ReelShareSheets("))

        let sheets = try source("Meeshy/Features/Main/Views/ReelsPlayerView+Send.swift")
        XCTAssertTrue(sheets.contains("ShareSheetView("), "« Envoyer » ouvre la feuille Meeshy.")
        XCTAssertTrue(sheets.contains("ShareSheet(activityItems:"), "« Partager » ouvre la feuille système.")
    }
}

/// Le bouton de la barre d'actions d'un post dit « Envoyer » et ouvre la
/// feuille Meeshy ; « Partager » hors Meeshy reste dans ⋯ (porteur 2026-11-01).
final class FeedPostSendWiringGuardTests: XCTestCase {

    func test_thePostActionBar_sendsIntoMeeshy_andTheMenuStillSharesOut() throws {
        let bar = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/FeedPostActionsBar.swift")
        XCTAssertTrue(bar.contains("\"feed.post.send\""))
        XCTAssertTrue(bar.contains("sent = SharedContentWrapper(subject: sendSubject)"))
        XCTAssertTrue(bar.contains(".modifier(MeeshySendSheet(sent: $sent))"))
        XCTAssertFalse(bar.contains("onShare"), "La barre n'ouvre plus la feuille système.")

        let card = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertTrue(card.contains("sendSubject: .publication(id: post.id, isReel: post.isReel"))
        let header = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/FeedPostCard+Header.swift")
        XCTAssertTrue(header.contains("onShare?(post.id)"), "« Partager » (feuille système) reste dans ⋯.")
    }
}

/// Le rail des réels nomme ses boutons comme celui de la story (#14323) : le
/// compte quand il y en a un, sinon le nom de l'action.
@MainActor
final class ReelRailCaptionTests: XCTestCase {
    func test_caption_isTheCount_whenThereIsOne() {
        XCTAssertEqual(ReelRailCaption.text(count: 12, label: "Envoyer"), CompactCountLabel.text(12))
    }

    func test_caption_isTheActionName_withoutCount() {
        XCTAssertEqual(ReelRailCaption.text(count: 0, label: "Envoyer"), "Envoyer")
    }
}
