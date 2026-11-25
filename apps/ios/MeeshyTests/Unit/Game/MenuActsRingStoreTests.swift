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
        return (MenuActsRingStore(source: source, publishWidget: { _ in }), source)
    }

    @MainActor private final class WidgetSpy {
        var published: [WidgetGameFlameState] = []
    }

    private func makeWidgetSUT(cached: GameBlock?) -> (sut: MenuActsRingStore, source: FakeSource, widget: WidgetSpy) {
        let source = FakeSource()
        source.cachedBlock = cached
        let widget = WidgetSpy()
        return (MenuActsRingStore(source: source, publishWidget: { widget.published.append($0) }), source, widget)
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

    func test_activate_beforeLevelFive_withAnOlderServer_showsNoRing() async {
        let (sut, _) = makeSUT(cached: GameFixture.game(score: 0, missions: []))

        await sut.activate(hidden: false)

        XCTAssertNil(sut.ring, "un serveur antérieur ne sert aucun acte avant le niveau 5 : aucun anneau")
    }

    func test_activate_beforeLevelFive_theFirstDreamHasAOneSegmentRing() async {
        let (sut, _) = makeSUT(cached: GameFixture.game(score: 0, missions: acts([true])))

        await sut.activate(hidden: false)

        XCTAssertEqual(sut.ring, GameActsRing(done: 1, total: 1), "le premier Rêve (#17370) a un acte : un segment")
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

    // MARK: - Ce que le jeu signale au barreau « Ma Légende » (#18165)

    func test_activate_withAnOfferingReadyInTheCache_raisesTheAttention_withoutAnyRequest() async {
        let (sut, source) = makeSUT(cached: GameFixture.game(missions: acts([true, false, false]), chestStatus: .ready))

        await sut.activate(hidden: false)

        XCTAssertEqual(sut.attention, GameAttention(chestReady: true, flameAtRisk: false))
        XCTAssertEqual(source.fetchCalls, 0, "le point se lit dans le cache, comme l'anneau")
    }

    func test_activate_withAFlameAtRisk_raisesTheAttention() async {
        let (sut, _) = makeSUT(cached: GameFixture.game(flameStatus: .atRisk, missions: acts([false, false, false])))

        await sut.activate(hidden: false)

        XCTAssertEqual(sut.attention, GameAttention(chestReady: false, flameAtRisk: true))
    }

    func test_readCache_afterTheOfferingIsOpened_lowersTheAttention() async {
        let (sut, source) = makeSUT(cached: GameFixture.game(missions: acts([true, true, true]), chestStatus: .ready))
        await sut.activate(hidden: false)

        source.cachedBlock = GameFixture.game(missions: acts([true, true, true]), chestStatus: .claimed)
        await sut.readCache()

        XCTAssertEqual(sut.attention, .none)
    }

    func test_activate_whenTheGameIsHidden_signalsNothing() async {
        let (sut, _) = makeSUT(cached: GameFixture.game(flameStatus: .atRisk, missions: acts([true, true, true]), chestStatus: .ready))
        await sut.activate(hidden: false)

        await sut.activate(hidden: true)

        XCTAssertEqual(sut.attention, .none, "« Jeu masqué » : aucun point")
    }

    // MARK: - Le widget de la Flamme (#20562, tranche iOS de #17369)

    func test_activate_publishesTheFlameAndTheActsOfTheDayToTheWidget_withoutAnyRequest() async {
        let (sut, source, widget) = makeWidgetSUT(cached: GameFixture.game(flameDays: 23, flameStatus: .atRisk,
                                                                         missions: acts([true, false, true])))

        await sut.activate(hidden: false)

        XCTAssertEqual(widget.published, [.shown(WidgetGameFlame(days: 23, status: "at-risk", actsDone: 2, actsTotal: 3))])
        XCTAssertEqual(source.fetchCalls, 0, "le widget se nourrit du cache, comme l'anneau")
    }

    func test_readCache_withAnUnchangedDay_doesNotReloadTheWidgetAgain() async {
        let (sut, _, widget) = makeWidgetSUT(cached: GameFixture.game(missions: acts([true, false, false])))
        await sut.activate(hidden: false)

        await sut.readCache()
        await sut.readCache()

        XCTAssertEqual(widget.published.count, 1, "l'app ne recharge le widget que si ce qu'elle publie change")
    }

    func test_readCache_afterAnActIsDone_publishesTheNewCount() async {
        let (sut, source, widget) = makeWidgetSUT(cached: GameFixture.game(flameDays: 4, missions: acts([true, false, false])))
        await sut.activate(hidden: false)

        source.cachedBlock = GameFixture.game(flameDays: 4, missions: acts([true, true, false]))
        await sut.readCache()

        XCTAssertEqual(widget.published.last, .shown(WidgetGameFlame(days: 4, status: "lit", actsDone: 2, actsTotal: 3)))
    }

    func test_activate_withAnEmptyCache_publishesNothing() async {
        let (sut, _, widget) = makeWidgetSUT(cached: nil)

        await sut.activate(hidden: false)

        XCTAssertTrue(widget.published.isEmpty, "aucun bloc : le widget garde ce qu'il montrait, rien n'est inventé")
    }

    func test_activate_whenTheGameIsHidden_emptiesTheWidget() async {
        let (sut, _, widget) = makeWidgetSUT(cached: GameFixture.game(missions: acts([true, true, false])))
        await sut.activate(hidden: false)

        await sut.activate(hidden: true)

        XCTAssertEqual(widget.published.last, .hidden, "« Jeu masqué » : le widget se vide")
    }

    func test_widgetSnapshot_carriesOnlyTheOwnFlameAndActs() {
        let fields = Mirror(reflecting: WidgetGameFlame(days: 1, status: "lit", actsDone: 0, actsTotal: 3)).children.compactMap(\.label)

        XCTAssertEqual(fields, ["days", "status", "actsDone", "actsTotal"], "rien d'autrui ne voyage vers le widget")
    }

    func test_widgetSnapshot_roundTripsThroughTheAppGroup_andAnUnreadableOneReadsAsNothing() throws {
        let shown = WidgetGameFlameState.shown(WidgetGameFlame(days: 9, status: "covered", actsDone: 3, actsTotal: 3))

        XCTAssertEqual(GameFlameWidgetKeys.decode(try JSONEncoder().encode(shown)), shown)
        XCTAssertEqual(GameFlameWidgetKeys.decode(try JSONEncoder().encode(WidgetGameFlameState.hidden)), .hidden)
        XCTAssertNil(GameFlameWidgetKeys.decode(Data("{}".utf8)))
        XCTAssertNil(GameFlameWidgetKeys.decode(nil))
    }

    // MARK: - « Jeu masqué » tient après une activation (#20567)

    func test_afterTheGameIsHidden_aReturnToTheForeground_neitherReadsNorRepaintsTheWidget() async {
        let (sut, source, widget) = makeWidgetSUT(cached: GameFixture.game(flameDays: 5, missions: acts([true, false, false])))
        await sut.activate(hidden: false)
        await sut.activate(hidden: true)
        let readsWhileShown = source.cachedCalls

        await sut.readCache()

        XCTAssertEqual(widget.published.last, .hidden, "« Jeu masqué » : un retour au premier plan ne rallume pas le widget")
        XCTAssertNil(sut.ring)
        XCTAssertEqual(sut.attention, .none)
        XCTAssertEqual(source.cachedCalls, readsWhileShown, "« Jeu masqué » : le magasin ne relit rien")
    }

    func test_afterTheGameIsShownAgain_theWidgetFollowsTheCacheAgain() async {
        let (sut, _, widget) = makeWidgetSUT(cached: GameFixture.game(flameDays: 5, missions: acts([true, false, false])))
        await sut.activate(hidden: true)

        await sut.activate(hidden: false)

        XCTAssertEqual(widget.published.last, .shown(WidgetGameFlame(days: 5, status: "lit", actsDone: 1, actsTotal: 3)))
    }

    // MARK: - Un seul magasin nourrit le widget, au-dessus des racines iPhone et iPad (#20567)

    func test_theWidgetIsFedAboveBothRoots_andOnlyThere() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Game/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views")
        let read = { (name: String) in try String(contentsOf: views.appendingPathComponent(name), encoding: .utf8) }

        let adaptive = try read("AdaptiveRootView.swift")
        XCTAssertEqual(adaptive.components(separatedBy: "GameFlameWidgetFeeder()").count - 1, 1,
                       "la racine commune monte le widget une fois, pour l'iPhone comme pour l'iPad")
        let roots = try ["RootView.swift", "RootFloatingChrome.swift", "iPadRootView.swift"].map(read).joined()
        XCTAssertFalse(roots.contains("GameFlameWidgetFeeder") || roots.contains("widgetFeed(") || roots.contains("publishWidget:"),
                       "aucune racine ne publie elle-même au widget : une seule source le nourrit")
    }
}
