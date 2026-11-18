import XCTest
import MeeshySDK
@testable import Meeshy

/// Créer un lien suit la planche (#19502) : la cible à suivre, les règles, l'aperçu du billet. Les brouillons disent
/// ce qui part vers la passerelle et ce que le billet montre pendant la saisie.
@MainActor
final class LinkCreationDraftTests: XCTestCase {

    private static let now = Date(timeIntervalSince1970: 1_800_000_000)
    private static let owner = TrackingLinkOwner(userId: "u1", username: "aissa")

    private func reel(_ id: String = "r1", title: String = "Dakar la nuit") -> TrackingLinkContent {
        TrackingLinkContent(id: id, title: title)
    }

    private func post(_ id: String, type: String?, visibility: String? = nil, content: String = "") -> FeedPost {
        var post = FeedPost(id: id, author: "Aïssa", authorId: "u1", type: type, content: content)
        post.visibility = visibility
        return post
    }

    // MARK: - Cible

    func test_request_whenAReelIsChosen_travelsTypedWithItsDirectAddress() throws {
        var draft = TrackingLinkDraft()
        draft.choose(.reel)
        draft.content = reel()

        let request = try XCTUnwrap(draft.request(owner: Self.owner, now: Self.now))

        XCTAssertEqual(request.originalUrl, "https://meeshy.me/reel/r1")
        XCTAssertEqual(request.targetType, "REEL")
        XCTAssertEqual(request.targetId, "r1")
    }

    func test_request_whenAContentTargetHasNoContentYet_isNil() {
        var draft = TrackingLinkDraft()
        draft.choose(.story)

        XCTAssertNil(draft.request(owner: Self.owner, now: Self.now))
        XCTAssertFalse(draft.canCreate(owner: Self.owner))
    }

    func test_choose_anotherTarget_forgetsTheContentChosenUnderThePreviousOne() {
        var draft = TrackingLinkDraft()
        draft.choose(.reel)
        draft.content = reel()

        draft.choose(.publication)

        XCTAssertNil(draft.content)
        XCTAssertEqual(draft.target, .publication)
    }

    func test_request_whenMyProfileIsTheTarget_followsMyShowcase() throws {
        var draft = TrackingLinkDraft()
        draft.choose(.profile)

        let request = try XCTUnwrap(draft.request(owner: Self.owner, now: Self.now))

        XCTAssertEqual(request.originalUrl, "https://meeshy.me/@aissa")
        XCTAssertEqual(request.targetType, "PROFILE")
        XCTAssertEqual(request.targetId, "u1")
    }

    func test_request_whenAnExternalAddressIsTyped_normalizesItAndSendsNoTarget() throws {
        var draft = TrackingLinkDraft()
        draft.externalAddress = "boutique.example/soldes"

        let request = try XCTUnwrap(draft.request(owner: Self.owner, now: Self.now))

        XCTAssertEqual(request.originalUrl, "https://boutique.example/soldes")
        XCTAssertNil(request.targetType)
        XCTAssertNil(request.targetId)
    }

    func test_showsAddressError_whenTheExternalAddressCannotOpen() {
        var draft = TrackingLinkDraft()
        draft.externalAddress = "javascript:alert(1)"

        XCTAssertTrue(draft.showsAddressError)
        XCTAssertNil(draft.request(owner: Self.owner, now: Self.now))
    }

    // MARK: - Règles

    func test_request_carriesTheChosenExpiry_andNeverOmitsIt() throws {
        var draft = TrackingLinkDraft()
        draft.externalAddress = "https://shop.example"
        draft.expiry = .days7
        let sevenDays = try XCTUnwrap(draft.request(owner: nil, now: Self.now))
        draft.expiry = .never
        let never = try XCTUnwrap(draft.request(owner: nil, now: Self.now))

        XCTAssertEqual(sevenDays.expiresAt, WireDate.string(from: Self.now.addingTimeInterval(7 * 86_400)))
        XCTAssertNil(never.expiresAt)
    }

    func test_request_carriesTheUniqueVisitorsChoice() throws {
        var draft = TrackingLinkDraft()
        draft.externalAddress = "https://shop.example"
        draft.countsUniqueVisitors = false

        let request = try XCTUnwrap(draft.request(owner: nil, now: Self.now))

        XCTAssertEqual(request.countsUniqueVisitors, false)
    }

    func test_slug_belowTheFloorOrWithForbiddenCharacters_blocksCreation() {
        var draft = TrackingLinkDraft()
        draft.externalAddress = "https://shop.example"
        draft.slug = "dkr"
        let tooShort = draft.canCreate(owner: nil)
        draft.slug = "dkr nuit"
        let spaced = draft.canCreate(owner: nil)
        draft.slug = "dkr-nuit"
        let fine = draft.canCreate(owner: nil)

        XCTAssertFalse(tooShort)
        XCTAssertFalse(spaced)
        XCTAssertTrue(fine)
    }

    func test_slugRules_normalizeTheTypedNameIntoAnAddress() {
        XCTAssertEqual(LinkSlugRules.normalized("Réel Dakar  la nuit !"), "reel-dakar-la-nuit")
        XCTAssertEqual(LinkSlugRules.normalized("-Été-"), "ete")
    }

    func test_fullAddress_composesTheMeasureOnlyWhenItIsGiven() {
        var draft = TrackingLinkDraft()
        draft.slug = "dkr-nuit"
        let bare = draft.fullAddress
        draft.source = "instagram"
        draft.medium = "bio"
        draft.campaign = "dakar-nuit-nov"

        XCTAssertNil(bare)
        XCTAssertEqual(draft.fullAddress,
                       "meeshy.me/l/dkr-nuit?utm_source=instagram&utm_medium=bio&utm_campaign=dakar-nuit-nov")
    }

    // MARK: - Billet

    func test_ticket_followsTheTypingAndTheRules() {
        var draft = TrackingLinkDraft()
        draft.choose(.reel)
        draft.content = reel()
        draft.slug = "dkr-nuit"
        let fromContent = draft.ticket
        draft.name = "Réel Dakar la nuit"
        draft.countsUniqueVisitors = false
        let named = draft.ticket

        XCTAssertEqual(fromContent.title, LinkCreationCopy.ticketTitle(of: .reel, content: "Dakar la nuit"))
        XCTAssertEqual(fromContent.code, "meeshy.me/l/dkr-nuit")
        XCTAssertEqual(fromContent.figures.count, 3)
        XCTAssertEqual(fromContent.figures[1], LinkCreationCopy.expiryFigure(.never))
        XCTAssertEqual(named.title, "Réel Dakar la nuit")
        XCTAssertEqual(named.figures.count, 2)
    }

    // MARK: - Contenus à suivre

    func test_choices_keepOnlyWhatTheTargetCanFollow_andOnlyPublicStories() {
        let posts = [
            post("p1", type: "POST", content: "Ma photo"),
            post("r1", type: "REEL", content: "Dakar la nuit\nsuite"),
            post("s1", type: "STORY", visibility: "PUBLIC"),
            post("s2", type: "STORY", visibility: "FRIENDS"),
            post("t1", type: "STATUS", content: "Au studio")
        ]

        XCTAssertEqual(TrackingLinkContent.choices(from: posts, for: .reel).map(\.id), ["r1"])
        XCTAssertEqual(TrackingLinkContent.choices(from: posts, for: .reel).first?.title, "Dakar la nuit")
        XCTAssertEqual(TrackingLinkContent.choices(from: posts, for: .story).map(\.id), ["s1"])
        XCTAssertEqual(TrackingLinkContent.choices(from: posts, for: .status).map(\.id), ["t1"])
        XCTAssertEqual(TrackingLinkContent.choices(from: posts, for: .publication).map(\.id), ["p1"])
        XCTAssertEqual(TrackingLinkContent.choices(from: posts, for: .story).first?.title, LinkCreationCopy.noun(of: .story))
    }

    // MARK: - Lien de partage

    func test_shareRequest_withoutConversation_isNil() {
        XCTAssertNil(ShareLinkDraft().request(now: Self.now))
    }

    func test_shareRequest_carriesTheRulesOfThePlanche() throws {
        var draft = ShareLinkDraft()
        draft.conversationId = "c1"
        draft.slug = "studio-invites"
        draft.expiry = .hours24
        draft.maxEntries = 50
        draft.asksEmail = true

        let request = try XCTUnwrap(draft.request(now: Self.now))

        XCTAssertEqual(request.identifier, "studio-invites")
        XCTAssertEqual(request.maxUses, 50)
        XCTAssertEqual(request.expiresAt, WireDate.string(from: Self.now.addingTimeInterval(24 * 3_600)))
        XCTAssertFalse(request.requireAccount)
        XCTAssertTrue(request.requireEmail)
        XCTAssertNil(request.allowedLanguages)
    }

    func test_shareRequest_whenGuestsMustHaveAnAccount_asksThemNothingElse() throws {
        var draft = ShareLinkDraft()
        draft.conversationId = "c1"
        draft.acceptsGuests = false
        draft.asksEmail = true

        let request = try XCTUnwrap(draft.request(now: Self.now))

        XCTAssertTrue(request.requireAccount)
        XCTAssertFalse(request.requireNickname)
        XCTAssertFalse(request.requireEmail)
    }

    func test_shareRequest_withoutAnEntryLimit_sendsNoCeiling() throws {
        var draft = ShareLinkDraft()
        draft.conversationId = "c1"
        draft.limitsEntries = false

        let request = try XCTUnwrap(draft.request(now: Self.now))

        XCTAssertNil(request.maxUses)
    }

    func test_languages_neverEmptyWhileRestricted_andAllReopensThem() throws {
        var draft = ShareLinkDraft()
        draft.conversationId = "c1"
        draft.setAllLanguages(false, fallback: "fr")
        draft.toggleLanguage("fr")
        let lastKept = draft.languages
        draft.toggleLanguage("wo")
        let request = try XCTUnwrap(draft.request(now: Self.now))
        draft.setAllLanguages(true, fallback: "fr")

        XCTAssertEqual(lastKept, ["fr"])
        XCTAssertEqual(request.allowedLanguages, ["fr", "wo"])
        XCTAssertEqual(draft.languages, [])
    }

    func test_shareTicket_saysEntriesExpiryAndGuests() {
        var draft = ShareLinkDraft()
        draft.conversationName = "Studio"
        draft.slug = "studio-invites"
        let ticket = draft.ticket
        draft.acceptsGuests = false
        let closed = draft.ticket

        XCTAssertEqual(ticket.title, "Studio")
        XCTAssertEqual(ticket.code, "meeshy.me/chat/studio-invites")
        XCTAssertEqual(ticket.figures[0].value, "0 / 50")
        XCTAssertEqual(ticket.figures[1], LinkCreationCopy.expiryFigure(.days7))
        XCTAssertEqual(ticket.figures[2], LinkCreationCopy.guestsFigure(true))
        XCTAssertEqual(closed.figures[2], LinkCreationCopy.guestsFigure(false))
    }

    func test_entriesStep_growsWithTheCeiling() {
        var draft = ShareLinkDraft()
        draft.maxEntries = 50
        let small = draft.entriesStep
        draft.maxEntries = 500
        let medium = draft.entriesStep
        draft.maxEntries = 5_000

        XCTAssertEqual(small, 1)
        XCTAssertEqual(medium, 10)
        XCTAssertEqual(draft.entriesStep, 100)
    }
}
