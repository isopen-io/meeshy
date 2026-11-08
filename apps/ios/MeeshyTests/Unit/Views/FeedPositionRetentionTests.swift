import XCTest
import MeeshySDK
@testable import Meeshy

/// **On retrouve sa place dans le fil** (#16676, #16779).
///
/// Deux pertes, deux lois. Le fil iPhone était DÉTRUIT dès qu'il se cachait
/// (`if showFeed`), position et liste avec lui : il est désormais retenu une
/// fois ouvert (`FeedRetention`, `RetainedFeedHost`). Et chaque post arrivé en
/// tête descendait la carte en lecture : ce qui arrive attend que le lecteur
/// remonte (`FeedHeadHold`).
@MainActor
final class FeedPositionRetentionTests: XCTestCase {

    private func post(_ id: String) -> FeedPost {
        FeedPost(id: id, author: "Awa", content: "Post \(id)")
    }

    private func ids(_ posts: [FeedPost]?) -> [String]? {
        posts?.map(\.id)
    }

    // MARK: - Le fil retenu

    func test_feed_isMountedWhileShown_andStaysMountedOnceOpened() {
        XCTAssertTrue(FeedRetention.isMounted(isShown: true, isRetained: false))
        XCTAssertTrue(FeedRetention.isMounted(isShown: false, isRetained: true), "caché, il reste monté")
        XCTAssertFalse(FeedRetention.isMounted(isShown: false, isRetained: false), "jamais ouvert, rien à garder")
    }

    func test_feed_onceShown_isRetainedAcrossHiding() {
        let opened = FeedRetention.retains(wasRetained: false, isShown: true)
        let hidden = FeedRetention.retains(wasRetained: opened, isShown: false)

        XCTAssertTrue(hidden)
    }

    func test_memoryWarning_releasesOnlyAHiddenFeed() {
        XCTAssertFalse(FeedRetention.retainsAfterMemoryWarning(isShown: false))
        XCTAssertTrue(FeedRetention.retainsAfterMemoryWarning(isShown: true))
    }

    func test_head_isHeld_whenHidden_orReadBelowTheHead() {
        XCTAssertTrue(FeedRetention.holdsHead(offset: 0, isShown: false))
        XCTAssertTrue(FeedRetention.holdsHead(offset: -(FeedRetention.headHoldDepth + 1), isShown: true))
        XCTAssertFalse(FeedRetention.holdsHead(offset: 0, isShown: true))
        XCTAssertFalse(FeedRetention.holdsHead(offset: -(FeedRetention.headHoldDepth - 1), isShown: true))
    }

    /// Le fil n'est plus monté par un `if` qui le détruirait en se cachant.
    func test_rootView_mountsTheFeedThroughTheRetainingHost() throws {
        let root = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootView.swift"))

        XCTAssertTrue(root.contains("RetainedFeedHost(isShown: showFeed)"))
        XCTAssertFalse(root.contains("if showFeed {"), "un fil monté par `if showFeed` perd sa place en se cachant")
    }

    /// Caché, le fil ne joue rien et n'élit aucun réel.
    func test_hiddenFeed_electsNoReel_andStopsPlayback() throws {
        let host = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootViewComponents.swift"))

        XCTAssertTrue(host.contains("frames: feedIsShown ? frames : []"))
        XCTAssertTrue(host.contains(".modifier(FeedRetentionHooks(relay: scrollRelay, onHidden: feedDidHide, onHoldingHead: holdFeedHead))"))
        XCTAssertTrue(host.contains("reelAutoplay.clear()"))
    }

    // MARK: - La tête tenue

    func test_arrival_atTheTop_isShownAtOnce() {
        var hold = FeedHeadHold()

        let shown = hold.admitting(post("new"), over: [post("a"), post("b")])

        XCTAssertEqual(ids(shown), ["new", "a", "b"])
        XCTAssertTrue(hold.held.isEmpty)
    }

    func test_arrival_whileReadingBelow_waits_andLeavesTheListUntouched() {
        var hold = FeedHeadHold()
        _ = hold.settingHolding(true, over: [post("a")])

        let shown = hold.admitting(post("new"), over: [post("a"), post("b")])

        XCTAssertNil(shown, "la carte en lecture ne bouge pas")
        XCTAssertEqual(hold.held.map(\.id), ["new"])
    }

    func test_backAtTheTop_heldPostsEnter_newestFirst() {
        var hold = FeedHeadHold()
        let list = [post("a"), post("b")]
        _ = hold.settingHolding(true, over: list)
        _ = hold.admitting(post("first"), over: list)
        _ = hold.admitting(post("second"), over: list)

        let shown = hold.settingHolding(false, over: list)

        XCTAssertEqual(ids(shown), ["second", "first", "a", "b"])
        XCTAssertTrue(hold.held.isEmpty)
    }

    func test_releasing_withNothingHeld_changesNothing() {
        var hold = FeedHeadHold()
        _ = hold.settingHolding(true, over: [post("a")])

        XCTAssertNil(hold.settingHolding(false, over: [post("a")]))
    }

    func test_knownPost_isNeverDuplicated() {
        var hold = FeedHeadHold()
        let list = [post("a")]
        _ = hold.settingHolding(true, over: list)
        _ = hold.admitting(post("new"), over: list)

        XCTAssertNil(hold.admitting(post("a"), over: list))
        XCTAssertNil(hold.admitting(post("new"), over: list))
        XCTAssertEqual(hold.held.map(\.id), ["new"])
    }

    func test_emptyFeed_neverHolds_theFirstLoadShows() {
        var hold = FeedHeadHold()
        _ = hold.settingHolding(true, over: [])

        XCTAssertEqual(ids(hold.admitting(post("new"), over: [])), ["new"])
        XCTAssertEqual(hold.admitting(head: [post("a"), post("b")], over: []).map(\.id), ["a", "b"])
    }

    func test_silentHeadRefresh_whileHolding_keepsWhatWasShown_andHoldsTheNewHead() {
        var hold = FeedHeadHold()
        let shown = [post("a"), post("b")]
        _ = hold.settingHolding(true, over: shown)

        let next = hold.admitting(head: [post("x"), post("y"), post("a"), post("b")], over: shown)

        XCTAssertEqual(next.map(\.id), ["a", "b"])
        XCTAssertEqual(hold.held.map(\.id), ["x", "y"])
    }

    func test_silentHeadRefresh_atTheTop_showsEverything() {
        var hold = FeedHeadHold()

        let next = hold.admitting(head: [post("x"), post("a")], over: [post("a")])

        XCTAssertEqual(next.map(\.id), ["x", "a"])
    }

    func test_deletedWhileHeld_neverEnters() {
        var hold = FeedHeadHold()
        let list = [post("a")]
        _ = hold.settingHolding(true, over: list)
        _ = hold.admitting(post("gone"), over: list)

        hold.forgetting("gone")

        XCTAssertNil(hold.settingHolding(false, over: list))
    }

    func test_heldPostAlreadyShownMeanwhile_entersOnce() {
        var hold = FeedHeadHold()
        _ = hold.settingHolding(true, over: [post("a")])
        _ = hold.admitting(post("new"), over: [post("a")])

        let shown = hold.settingHolding(false, over: [post("new"), post("a")])

        XCTAssertEqual(ids(shown), ["new", "a"])
    }
}
