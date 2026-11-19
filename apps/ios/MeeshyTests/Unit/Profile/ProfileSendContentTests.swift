import XCTest
import MeeshySDK
@testable import Meeshy

/// « Lui envoyer un contenu » sur la fiche d'un Proche (#19628, planche `Autre-Actions`) : mes publications, mes réels
/// et mes stories, envoyés vers NOTRE conversation directe — créée au besoin par le chemin unique du partage.
@MainActor
final class ProfileSendContentTests: XCTestCase {

    // MARK: - Ce que chaque onglet propose

    func test_publicationKind_acceptsMediaAndTextPosts_notReelsNorStories() {
        let kind = ProfileSendContentKind.publication
        XCTAssertTrue(kind.accepts(makePhoto()))
        XCTAssertTrue(kind.accepts(makePost(type: "POST")))
        XCTAssertFalse(kind.accepts(makePost(type: "REEL")))
        XCTAssertFalse(kind.accepts(makePost(type: "STORY")))
    }

    func test_reelKind_acceptsOnlyReels() {
        XCTAssertTrue(ProfileSendContentKind.reel.accepts(makePost(type: "REEL")))
        XCTAssertFalse(ProfileSendContentKind.reel.accepts(makePhoto()))
    }

    func test_storyKind_acceptsAStoryReservedToFriends() {
        let story = makePost(type: "STORY", visibility: "FRIENDS")
        XCTAssertTrue(ProfileSendContentKind.story.accepts(story))
        XCTAssertFalse(ProfileSendContentKind.story.accepts(makePost(type: "REEL")))
    }

    // MARK: - Ce que la rangée annonce avant de conclure au vide

    func test_listing_beforeTheFirstReadSettles_isLoading_neverEmpty() {
        let listing = ProfileSendContentListing.resolve(
            hasChoices: false, settled: false, isLoading: false, hasMore: true, pagination: .idle)
        XCTAssertEqual(listing, .loading)
    }

    func test_listing_failedReadWithNothingServed_isFailed_notEmpty() {
        let listing = ProfileSendContentListing.resolve(
            hasChoices: false, settled: true, isLoading: false, hasMore: true, pagination: .error("réseau"))
        XCTAssertEqual(listing, .failed)
    }

    func test_listing_noMatchOnThisPageButMoreToRead_keepsLoading_andPagesFurther() {
        let listing = ProfileSendContentListing.resolve(
            hasChoices: false, settled: true, isLoading: false, hasMore: true, pagination: .idle)
        let pages = ProfileSendContentListing.pagesFurther(
            hasChoices: false, settled: true, isLoading: false, hasMore: true, pagination: .idle)
        XCTAssertEqual(listing, .loading)
        XCTAssertTrue(pages)
    }

    func test_listing_exhaustedWithoutMatch_isEmpty_andStopsPaging() {
        let listing = ProfileSendContentListing.resolve(
            hasChoices: false, settled: true, isLoading: false, hasMore: false, pagination: .exhausted)
        let pages = ProfileSendContentListing.pagesFurther(
            hasChoices: false, settled: true, isLoading: false, hasMore: false, pagination: .exhausted)
        XCTAssertEqual(listing, .empty)
        XCTAssertFalse(pages)
    }

    func test_listing_failedPage_doesNotPageAgainOnItsOwn() {
        let pages = ProfileSendContentListing.pagesFurther(
            hasChoices: false, settled: true, isLoading: false, hasMore: true, pagination: .error("réseau"))
        XCTAssertFalse(pages)
    }

    func test_listing_servedChoices_winOverAnyLoadingOrFailure() {
        let listing = ProfileSendContentListing.resolve(
            hasChoices: true, settled: false, isLoading: true, hasMore: true, pagination: .error("réseau"))
        XCTAssertEqual(listing, .choices)
    }

    // MARK: - Une publication sans média se reconnaît à son texte

    func test_textTile_textOnlyPost_showsItsFirstLine() {
        let post = FeedPost(id: "t1", author: "Moi", authorId: "me", type: "POST", content: "Premier jour\nla suite")
        XCTAssertEqual(ProfileSendContentCopy.textTile(of: post), "Premier jour")
    }

    func test_textTile_mediaPost_hasNoText() {
        XCTAssertNil(ProfileSendContentCopy.textTile(of: makePhoto()))
    }

    // MARK: - L'envoi

    func test_send_publication_goesToThePerson_withTheTrackedLink() async {
        let spy = SendContentSpy()
        spy.link = URL(string: "https://meeshy.me/l/abc")
        let model = makeModel(spy: spy)

        let outcome = await model.send(makePhoto(id: "p1"))

        XCTAssertEqual(outcome, .sent(conversationId: "created-user:u1"))
        XCTAssertEqual(spy.delivered.count, 1)
        let recipient = spy.delivered.first?.recipient
        XCTAssertEqual(recipient?.userId, "u1")
        XCTAssertNil(recipient?.conversationId)
        guard case .card(let card)? = spy.delivered.first?.request.subject else {
            return XCTFail("une publication part comme une carte")
        }
        XCTAssertEqual(card.kind, .post)
        XCTAssertEqual(card.contentId, "p1")
        XCTAssertEqual(card.url, URL(string: "https://meeshy.me/l/abc"))
        XCTAssertEqual(model.phase, .sent(conversationId: "created-user:u1"))
    }

    func test_send_reel_partsAsAReelCard() async {
        let spy = SendContentSpy()
        let model = makeModel(spy: spy)

        _ = await model.send(makePost(id: "r1", type: "REEL"))

        guard case .card(let card)? = spy.delivered.first?.request.subject else {
            return XCTFail("un réel part comme une carte")
        }
        XCTAssertEqual(card.kind, .reel)
        XCTAssertEqual(card.url, URL(string: "https://meeshy.me/feeds/post/r1"))
    }

    func test_send_storyReservedToFriends_mintsNoTrackedLink() async {
        let spy = SendContentSpy()
        spy.link = URL(string: "https://meeshy.me/l/leak")
        let model = makeModel(spy: spy)

        _ = await model.send(makePost(id: "s1", type: "STORY", visibility: "FRIENDS"))

        XCTAssertEqual(spy.linkMints, 0)
        guard case .card(let card)? = spy.delivered.first?.request.subject else {
            return XCTFail("une story part comme une carte")
        }
        XCTAssertEqual(card.kind, .story)
        XCTAssertEqual(card.url, URL(string: "https://meeshy.me/story/s1"))
    }

    func test_send_refused_saysTheReason_andAllowsARetry() async {
        let spy = SendContentSpy()
        spy.outcome = .failed(reason: "Conversation chiffrée")
        let model = makeModel(spy: spy)

        _ = await model.send(makePhoto())
        XCTAssertEqual(model.phase, .failed(reason: "Conversation chiffrée"))

        spy.outcome = nil
        _ = await model.send(makePhoto())
        XCTAssertEqual(spy.delivered.count, 2)
        XCTAssertEqual(model.phase, .sent(conversationId: "created-user:u1"))
    }

    func test_send_whileSending_doesNotSendTwice() async {
        let spy = SendContentSpy()
        spy.holdsDelivery = true
        let model = makeModel(spy: spy)
        let post = makePhoto()

        let first = Task { await model.send(post) }
        for _ in 0..<200 where spy.pending == nil { await Task.yield() }
        XCTAssertTrue(model.isSending)

        let second = await model.send(post)
        XCTAssertNil(second)

        spy.pending?.resume(returning: .sent(conversationId: "c1"))
        let firstOutcome = await first.value
        XCTAssertEqual(firstOutcome, .sent(conversationId: "c1"))
        XCTAssertEqual(spy.delivered.count, 1)
        XCTAssertFalse(model.isSending)
    }

    // MARK: - Fabriques

    private func makeModel(spy: SendContentSpy) -> ProfileSendContentViewModel {
        ProfileSendContentViewModel(userId: "u1", displayName: "Léa", dispatcher: spy)
    }

    private func makePost(id: String = "p1", type: String, visibility: String? = "PUBLIC") -> FeedPost {
        var post = FeedPost(id: id, author: "Moi", authorId: "me", type: type, content: "Bonjour")
        post.visibility = visibility
        return post
    }

    private func makePhoto(id: String = "p1") -> FeedPost {
        var post = FeedPost(id: id, author: "Moi", authorId: "me", type: "POST", content: "",
                            media: [FeedMedia(id: "m1", type: .image, url: "https://meeshy.me/m1.jpg")])
        post.visibility = "PUBLIC"
        return post
    }
}

private final class SendContentSpy: ShareDispatching {
    nonisolated deinit {}
    var outcome: ShareDeliveryOutcome?
    var link: URL?
    var holdsDelivery = false
    private(set) var pending: CheckedContinuation<ShareDeliveryOutcome, Never>?
    private(set) var delivered: [(recipient: ShareRecipient, request: ShareSendRequest)] = []
    private(set) var linkMints = 0

    func deliver(_ request: ShareSendRequest, to recipient: ShareRecipient) async -> ShareDeliveryOutcome {
        delivered.append((recipient, request))
        if holdsDelivery {
            return await withCheckedContinuation { continuation in pending = continuation }
        }
        return outcome ?? .sent(conversationId: "created-\(recipient.id)")
    }

    func createGroup(with people: [ShareRecipient]) async -> ShareRecipient? { nil }

    func publish(attachment: MessageAttachment, to target: PublicationTarget) async -> Bool { false }

    func resolvedLink(for card: ShareCard) async -> URL? {
        linkMints += 1
        return link
    }
}
