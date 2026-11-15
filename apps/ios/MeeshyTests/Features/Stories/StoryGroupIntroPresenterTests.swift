import XCTest
@testable import Meeshy
import MeeshySDK

/// The identity interlude between two authors' groups (#13135): shown at
/// once (pre-resolved identity, else a placeholder), enriched while shown,
/// withdrawn after its hold — and the identities of the neighbouring groups
/// resolved ahead, so the next interlude is complete from its first frame.
@MainActor
final class StoryGroupIntroPresenterTests: XCTestCase {

    private typealias Intro = StoryViewModel.StoryGroupIntro

    private static func intro(_ userId: String, displayName: String? = nil) -> Intro {
        var intro = Intro(userId: userId, username: "u-\(userId)")
        intro.displayName = displayName
        return intro
    }

    private static func group(_ id: String) -> StoryGroup {
        StoryGroup(id: id, username: "u-\(id)", avatarColor: "4ECDC4", avatarURL: nil, stories: [])
    }

    private func settle() async {
        for _ in 0..<20 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 30_000_000)
    }

    func test_present_uncached_showsThePlaceholderAtOnce_thenTheResolvedIdentity() async {
        let sut = StoryGroupIntroPresenter()

        sut.present(Self.intro("a"), hold: 10, resolve: { Self.intro("a", displayName: "Alice") }, elapsed: {})

        XCTAssertTrue(sut.isShown)
        XCTAssertEqual(sut.intro, Self.intro("a"))
        await settle()
        XCTAssertEqual(sut.intro?.displayName, "Alice")
        XCTAssertEqual(sut.resolvedIntro(for: "a")?.displayName, "Alice")
        sut.cancelPending()
    }

    func test_present_prefetched_showsTheResolvedIdentityFromTheFirstFrame() async {
        let sut = StoryGroupIntroPresenter()
        sut.prefetch([Self.group("a")], resolve: { _ in Self.intro("a", displayName: "Alice") })
        await settle()

        sut.present(Self.intro("a"), hold: 10, resolve: { Self.intro("a", displayName: "Alice") }, elapsed: {})

        XCTAssertEqual(sut.intro?.displayName, "Alice")
        sut.cancelPending()
    }

    func test_present_holdElapses_handsTheWithdrawalBack() async {
        let sut = StoryGroupIntroPresenter()
        var elapsed = 0

        sut.present(Self.intro("a"), hold: 0.01, resolve: { Self.intro("a") }, elapsed: { elapsed += 1 })
        try? await Task.sleep(nanoseconds: 150_000_000)

        XCTAssertEqual(elapsed, 1)
    }

    func test_cancelPending_beforeTheHold_neverHandsTheWithdrawalBack() async {
        let sut = StoryGroupIntroPresenter()
        var elapsed = 0

        sut.present(Self.intro("a"), hold: 0.05, resolve: { Self.intro("a") }, elapsed: { elapsed += 1 })
        sut.cancelPending()
        try? await Task.sleep(nanoseconds: 150_000_000)

        XCTAssertEqual(elapsed, 0)
    }

    func test_enrichment_arrivingAfterTheInterludeWasHidden_isCachedButNotShown() async {
        let sut = StoryGroupIntroPresenter()

        sut.present(Self.intro("a"), hold: 10, resolve: { Self.intro("a", displayName: "Alice") }, elapsed: {})
        sut.isShown = false
        await settle()

        XCTAssertNil(sut.intro?.displayName)
        XCTAssertEqual(sut.resolvedIntro(for: "a")?.displayName, "Alice")
        sut.cancelPending()
    }

    func test_prefetch_skipsAnIdentityAlreadyResolved() async {
        let sut = StoryGroupIntroPresenter()
        var resolutions = 0
        sut.prefetch([Self.group("a")], resolve: { _ in resolutions += 1; return Self.intro("a") })
        await settle()

        sut.prefetch([Self.group("a"), Self.group("b")], resolve: { group in
            resolutions += 1
            return Self.intro(group.id)
        })
        await settle()

        XCTAssertEqual(resolutions, 2)
        XCTAssertNotNil(sut.resolvedIntro(for: "b"))
    }
}
