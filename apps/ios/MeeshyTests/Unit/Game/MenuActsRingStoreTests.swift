import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// L'anneau des actes autour du bouton du menu (#17768) se nourrit du CACHE du jeu, sans requête — miroir de
/// `floating-menus-acts.test.tsx` (web) : il lit le dernier bloc connu, suit ses écritures, et se tait sous
/// « Jeu masqué ».
@MainActor
final class MenuActsRingStoreTests: XCTestCase {

    private final class FakeSource: PlayerBannerSourcing, @unchecked Sendable {
        var cachedBlock: GameBlock?
        private(set) var cachedCalls = 0
        private(set) var fetchCalls = 0

        func cached() async -> GameBlock? {
            cachedCalls += 1
            return cachedBlock
        }

        func fetch() async -> GameBlock? {
            fetchCalls += 1
            return nil
        }
    }

    private func acts(_ done: [Bool]) -> [GameBlock.Mission] {
        done.enumerated().map { index, isDone in GameFixture.mission(id: "m\(index)", completed: isDone) }
    }

    private func makeSUT(cached: GameBlock?) -> (sut: MenuActsRingStore, source: FakeSource) {
        let source = FakeSource()
        source.cachedBlock = cached
        return (MenuActsRingStore(source: source), source)
    }

    func test_activate_withACachedDay_showsTheActsDoneOutOfTheDay_withoutAnyRequest() async {
        let (sut, source) = makeSUT(cached: GameFixture.game(missions: acts([true, false, true])))

        await sut.activate(hidden: false)

        XCTAssertEqual(sut.ring, GameActsRing(done: 2, total: 3))
        XCTAssertEqual(source.fetchCalls, 0, "l'anneau ne lance jamais de requête : il lit le cache")
    }

    func test_activate_withAnEmptyCache_showsNoRing() async {
        let (sut, _) = makeSUT(cached: nil)

        await sut.activate(hidden: false)

        XCTAssertNil(sut.ring, "cache vide (ou ancien serveur) : aucun anneau, jamais un anneau vide inventé")
    }

    func test_activate_beforeLevelFive_showsNoRing() async {
        let (sut, _) = makeSUT(cached: GameFixture.game(score: 0, missions: acts([true, false, false])))

        await sut.activate(hidden: false)

        XCTAssertNil(sut.ring, "les actes ne sont pas ouverts avant le niveau 5")
    }

    func test_activate_whenTheGameIsHidden_readsNothingAndShowsNoRing() async {
        let (sut, source) = makeSUT(cached: GameFixture.game(missions: acts([true, true, false])))

        await sut.activate(hidden: true)

        XCTAssertNil(sut.ring)
        XCTAssertEqual(source.cachedCalls, 0, "« Jeu masqué » : le magasin ne relit rien")
    }

    func test_readCache_afterAnActIsDone_lightsOneMoreSegment() async {
        let (sut, source) = makeSUT(cached: GameFixture.game(missions: acts([true, false, false])))
        await sut.activate(hidden: false)

        source.cachedBlock = GameFixture.game(missions: acts([true, true, false]))
        await sut.readCache()

        XCTAssertEqual(sut.ring, GameActsRing(done: 2, total: 3))
    }

    func test_readCache_whenTheCacheIsEmptied_keepsWhatIsShown() async {
        let (sut, source) = makeSUT(cached: GameFixture.game(missions: acts([true, false, false])))
        await sut.activate(hidden: false)

        source.cachedBlock = nil
        await sut.readCache()

        XCTAssertEqual(sut.ring, GameActsRing(done: 1, total: 3), "une lecture vide ne retire rien")
    }

    func test_aPersistedSnapshot_isReadAgain() async {
        let (sut, source) = makeSUT(cached: GameFixture.game(missions: acts([false, false, false])))
        await sut.activate(hidden: false)
        source.cachedBlock = GameFixture.game(missions: acts([true, true, true]))

        let lit = expectation(description: "l'anneau suit l'écriture du cache")
        let cancellable = sut.$ring.dropFirst().sink { ring in
            if ring == GameActsRing(done: 3, total: 3) { lit.fulfill() }
        }
        NotificationCenter.default.post(name: .engagementSnapshotPersisted, object: nil)

        await fulfillment(of: [lit], timeout: 2)
        cancellable.cancel()
    }
}
