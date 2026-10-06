import XCTest
import SwiftUI
import UIKit
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// La bannière du joueur (#9494, conception XIII.1) : ce qu'elle dit, où elle a sa place, de quelle couleur elle
/// est, et comment elle se nourrit — cache d'abord, revalidation silencieuse, « Jeu masqué » sans une requête.
@MainActor
final class PlayerBannerTests: XCTestCase {

    private func completeBanner() -> GamePlayerBanner {
        GamePlayerBanner(game: GameWave2Fixture.game())
    }

    /// Un nouveau joueur : ni Meesh, ni Gloire, ni ligue, ni Flamme.
    private func newPlayerBanner() -> GamePlayerBanner {
        GamePlayerBanner(game: GameWave2Fixture.game(league: nil, held: 0).replacing(
            glory: GameBlock.Glory(glory: 0, rank: .murmure, division: .iii, next: nil, gloryMissing: nil, progress: 0),
            flame: GameBlock.Flame(days: 0, form: nil, bonusPercent: 0, freezes: 0, maxFreezes: 2, freezePrice: 1, relightPrice: 3,
                                   status: .none, canRelight: false)
        ))
    }

    // MARK: - Où elle a sa place

    func test_theBannerIsHostedOnMainScreensOnly_neverOnADeepRouteNorOverTheReels() {
        XCTAssertTrue(PlayerBannerPlacement.hosts(routeIsDeep: false, reelsAreOpen: false))
        XCTAssertFalse(PlayerBannerPlacement.hosts(routeIsDeep: true, reelsAreOpen: false), "un fil, un détail, Progression : pas de bannière")
        XCTAssertFalse(PlayerBannerPlacement.hosts(routeIsDeep: false, reelsAreOpen: true), "le lecteur de réels est plein cadre")
    }

    func test_onATablet_anOpenConversationTakesTheWholeHeight() {
        XCTAssertTrue(PlayerBannerPlacement.hostsOnTablet(conversationIsOpen: false, panelRoute: nil, reelsAreOpen: false))
        XCTAssertFalse(PlayerBannerPlacement.hostsOnTablet(conversationIsOpen: true, panelRoute: nil, reelsAreOpen: false))
        XCTAssertFalse(PlayerBannerPlacement.hostsOnTablet(conversationIsOpen: false, panelRoute: nil, reelsAreOpen: true))
    }

    /// L'iPad ouvre ses routes dans le panneau de droite, jamais dans la pile du routeur : `isDeepRoute` y reste
    /// faux. La loi de l'iPhone — un écran principal porte la bannière, un écran profond non — se lit donc sur la
    /// route du PANNEAU. Progression ouverte à droite sous la bannière la répétait (son héros dit déjà tout).
    func test_onATablet_aDeepPanelRouteHidesTheBanner_likeADeepRouteOnThePhone() {
        XCTAssertFalse(PlayerBannerPlacement.hostsOnTablet(conversationIsOpen: false, panelRoute: .progression, reelsAreOpen: false),
                       "Progression dans le panneau : son héros dit déjà tout")
        XCTAssertFalse(PlayerBannerPlacement.hostsOnTablet(conversationIsOpen: false, panelRoute: .gamePage(.league), reelsAreOpen: false))
        XCTAssertTrue(PlayerBannerPlacement.hostsOnTablet(conversationIsOpen: false, panelRoute: .settings, reelsAreOpen: false),
                      "un écran principal (un hub) porte la bannière, comme sur iPhone")
        XCTAssertTrue(PlayerBannerPlacement.hostsOnTablet(conversationIsOpen: false, panelRoute: .notifications, reelsAreOpen: false))
    }

    func test_theBannerOnlyShowsWhenNothingElseOccupiesTheTop_andTheGameIsNotHidden() {
        XCTAssertTrue(PlayerBannerPlacement.shows(hosted: true, free: true, hidden: false))
        XCTAssertFalse(PlayerBannerPlacement.shows(hosted: true, free: false, hidden: false), "un appel ou un audio prime")
        XCTAssertFalse(PlayerBannerPlacement.shows(hosted: false, free: true, hidden: false))
        XCTAssertFalse(PlayerBannerPlacement.shows(hosted: true, free: true, hidden: true), "« Jeu masqué » : rien")
    }

    // MARK: - Ce qu'elle dit

    func test_theSentenceReadsEveryPiece_inTheOrderOfTheBanner() {
        let banner = completeBanner()
        let label = PlayerBannerCopy.accessibilityLabel(for: banner)
        let order = [
            GameText.bannerLevel(level: GameCopy.formatCount(banner.level)),
            GameCopy.tierName(banner.tier),
            GameCopy.meeshes(banner.meeshes ?? 0),
            GameCopy.rankLabel(banner.rank?.rank ?? .murmure, division: banner.rank?.division),
            GameText.leagueName(banner.league?.league ?? .quartz),
            GameCopy.days(banner.flame?.days ?? 0),
        ]
        var cursor = label.startIndex
        for piece in order {
            let found = label.range(of: piece, range: cursor..<label.endIndex)
            XCTAssertNotNil(found, "« \(piece) » manque, ou n'est pas dans l'ordre : \(label)")
            if let found { cursor = found.upperBound }
        }
        XCTAssertFalse(label.contains("game2."), "une clé brute : \(label)")
    }

    func test_aNewPlayer_sentenceSaysOnlyTheLevelTheTierAndTheGauge() {
        let banner = newPlayerBanner()
        XCTAssertNil(banner.meeshes)
        XCTAssertNil(banner.rank)
        XCTAssertNil(banner.league)
        XCTAssertNil(banner.flame)
        let label = PlayerBannerCopy.accessibilityLabel(for: banner)
        XCTAssertFalse(label.contains(GameCopy.meeshes(0)), "jamais « aucune Meesh » : ce qui n'existe pas ne se dit pas")
        XCTAssertEqual(label.components(separatedBy: GameText.bannerSeparator).count, 3, label)
    }

    func test_atTheTop_theSentenceSaysSo_insteadOfAPercentage() {
        let base = GameWave2Fixture.atLevel100()
        let banner = GamePlayerBanner(game: base)
        XCTAssertNil(banner.nextLevel)
        XCTAssertTrue(PlayerBannerCopy.accessibilityLabel(for: banner).contains(GameText.bannerTop))
        XCTAssertNil(PlayerBannerCopy.texts(for: banner).missing, "au sommet, plus rien ne manque")
    }

    func test_theShortTexts_carryTheFormattedFigures_andOnlyForWhatExists() {
        let banner = completeBanner()
        let texts = PlayerBannerCopy.texts(for: banner)
        XCTAssertTrue(texts.points.contains(GameCopy.formatCount(banner.score)))
        XCTAssertEqual(texts.meeshes, GameCopy.formatCount(banner.meeshes ?? -1))
        XCTAssertEqual(texts.flameDays, GameCopy.formatCount(banner.flame?.days ?? -1))
        XCTAssertNotNil(texts.place)
        let bare = PlayerBannerCopy.texts(for: newPlayerBanner())
        XCTAssertNil(bare.meeshes)
        XCTAssertNil(bare.place)
        XCTAssertNil(bare.flameDays)
    }

    func test_theOrdinalFollowsTheRulesOfEachLanguage() {
        XCTAssertEqual(GameOrdinal.category(of: 1, languageCode: "en"), .one)
        XCTAssertEqual(GameOrdinal.category(of: 2, languageCode: "en"), .two)
        XCTAssertEqual(GameOrdinal.category(of: 3, languageCode: "en"), .few)
        XCTAssertEqual(GameOrdinal.category(of: 4, languageCode: "en"), .other)
        for teen in [11, 12, 13] { XCTAssertEqual(GameOrdinal.category(of: teen, languageCode: "en"), .other, "\(teen)") }
        XCTAssertEqual(GameOrdinal.category(of: 21, languageCode: "en"), .one)
        XCTAssertEqual(GameOrdinal.category(of: 22, languageCode: "en"), .two)
        XCTAssertEqual(GameOrdinal.category(of: 1, languageCode: "fr"), .one)
        XCTAssertEqual(GameOrdinal.category(of: 2, languageCode: "fr"), .other)
        for language in ["es", "pt", "it", "de", "ar"] {
            XCTAssertEqual(GameOrdinal.category(of: 1, languageCode: language), .other, language)
        }
    }

    func test_thePlace_carriesItsNumber_andEnglishNeverReadsTwoTh() {
        for place in [1, 2, 3, 4, 12, 21] {
            XCTAssertTrue(GameText.bannerPlace(count: place).contains(GameCopy.formatCount(place)), "\(place)")
        }
        let english = (1...4).map { GameText.bannerPlace(count: $0, languageCode: "en") }
        XCTAssertEqual(Set(english).count, 4, "1st, 2nd, 3rd et 4th se distinguent : \(english)")
    }

    // MARK: - De quelle couleur

    func test_theSurfaceIsOpaqueAndTintedByTheTier_inBothThemes() {
        for isDark in [false, true] {
            let spark = PlayerBannerStyle.surface(tier: .etincelle, isDark: isDark)
            let radiance = PlayerBannerStyle.surface(tier: .rayon, isDark: isDark)
            XCTAssertNotEqual(spark, radiance, "le palier teinte l'aplat (\(isDark ? "sombre" : "clair"))")
            var alpha: CGFloat = 0
            UIColor(spark).getRed(nil, green: nil, blue: nil, alpha: &alpha)
            XCTAssertEqual(alpha, 1, accuracy: 0.001, "un aplat opaque : la bande du haut le reprend")
        }
        XCTAssertNotEqual(PlayerBannerStyle.surface(tier: .eclat, isDark: false), PlayerBannerStyle.surface(tier: .eclat, isDark: true))
    }

    func test_theBlend_goesFromTheBaseToTheTint() {
        let base = UIColor(red: 1, green: 1, blue: 1, alpha: 1)
        let tint = UIColor(red: 0, green: 0.5, blue: 1, alpha: 1)
        func rgb(_ color: UIColor) -> [CGFloat] {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            color.getRed(&r, green: &g, blue: &b, alpha: &a)
            return [r, g, b]
        }
        func assertEqual(_ actual: [CGFloat], _ expected: [CGFloat], _ message: String = "", line: UInt = #line) {
            XCTAssertEqual(actual.count, expected.count, line: line)
            for (a, e) in zip(actual, expected) { XCTAssertEqual(a, e, accuracy: 0.001, message, line: line) }
        }
        assertEqual(rgb(PlayerBannerStyle.blend(base, tint, share: 0)), [1, 1, 1])
        assertEqual(rgb(PlayerBannerStyle.blend(base, tint, share: 1)), [0, 0.5, 1])
        assertEqual(rgb(PlayerBannerStyle.blend(base, tint, share: 0.5)), [0.5, 0.75, 1])
        assertEqual(rgb(PlayerBannerStyle.blend(base, tint, share: 4)), [0, 0.5, 1], "une part hors de [0, 1] est bornée")
    }

    func test_theTopBandTakesTheBannerSurface_afterTheCallAndTheAudio() {
        let surface = Color(.sRGB, red: 0.9, green: 0.95, blue: 0.8, opacity: 1)
        XCTAssertEqual(TopChromeTint.resolve(callIsActive: false, audio: nil, banner: surface)?.bandColor, surface)
        XCTAssertEqual(TopChromeTint.resolve(callIsActive: true, audio: nil, banner: surface), .call, "l'appel prime")
        XCTAssertNil(TopChromeTint.resolve(callIsActive: false, audio: nil, banner: nil), "sans bannière ni barre : aucune bande")
    }

    // MARK: - Comment elle se nourrit

    private final class FakeSource: PlayerBannerSourcing, @unchecked Sendable {
        var cachedBlock: GameBlock?
        var fetchedBlock: GameBlock?
        private(set) var cachedCalls = 0
        private(set) var fetchCalls = 0

        func cached() async -> GameBlock? {
            cachedCalls += 1
            return cachedBlock
        }

        func fetch() async -> GameBlock? {
            fetchCalls += 1
            return fetchedBlock
        }
    }

    private func store(_ source: FakeSource, interval: TimeInterval = 45, clock: @escaping () -> Date = { Date() }) -> PlayerBannerStore {
        PlayerBannerStore(source: source, minimumInterval: interval, now: clock)
    }

    func test_theCacheIsPaintedFirst_thenTheNetworkCorrectsIt() async {
        let source = FakeSource()
        source.cachedBlock = GameFixture.game(score: 12_180)
        source.fetchedBlock = GameFixture.game(score: 14_000)
        let sut = store(source)
        XCTAssertNil(sut.banner, "avant toute lecture : rien, jamais un squelette")

        await sut.readCache()
        XCTAssertEqual(sut.banner?.score, 12_180, "le cache, même périmé, se peint tout de suite")
        XCTAssertEqual(source.fetchCalls, 0)

        await sut.revalidate()
        XCTAssertEqual(sut.banner?.score, 14_000)
    }

    func test_anEmptyCacheAndAnUnreachableServer_paintNothing() async {
        let sut = store(FakeSource())
        await sut.activate()
        XCTAssertNil(sut.banner)
    }

    func test_aFailedRevalidation_keepsWhatIsShown() async {
        let source = FakeSource()
        source.cachedBlock = GameFixture.game(score: 12_180)
        let sut = store(source)
        await sut.readCache()
        await sut.revalidate(force: true)
        XCTAssertEqual(sut.banner?.score, 12_180, "une coupure ne retire rien")
    }

    func test_revalidationIsThrottled_exceptWhenForced() async {
        let source = FakeSource()
        source.fetchedBlock = GameFixture.game()
        var now = Date(timeIntervalSince1970: 1_790_000_000)
        let sut = store(source, interval: 60, clock: { now })

        await sut.revalidate()
        await sut.revalidate()
        XCTAssertEqual(source.fetchCalls, 1, "deux appels dans la minute : une seule requête")

        await sut.revalidate(force: true)
        XCTAssertEqual(source.fetchCalls, 2, "une notification de palier force la relecture")

        now = now.addingTimeInterval(61)
        await sut.revalidate()
        XCTAssertEqual(source.fetchCalls, 3)
    }

    func test_whileTheGameIsHidden_theStoreReadsNothingAndAsksNothing() async {
        let source = FakeSource()
        source.cachedBlock = GameFixture.game()
        source.fetchedBlock = GameFixture.game()
        let sut = store(source)
        sut.setSuspended(true)
        await sut.activate()
        await sut.readCache()
        await sut.revalidate(force: true)
        XCTAssertEqual(source.cachedCalls, 0)
        XCTAssertEqual(source.fetchCalls, 0, "« Jeu masqué » : aucune requête")
        XCTAssertNil(sut.banner)

        sut.setSuspended(false)
        await sut.activate()
        XCTAssertNotNil(sut.banner)
    }

    // MARK: - Où elle est montée

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ relative: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    func test_theSlotSitsInTheTopStack_afterTheCallPillAndTheMiniPlayer() throws {
        let layer = try source("Meeshy/Features/Main/Views/RootLayers/CallPresentationLayer.swift")
        let pill = try XCTUnwrap(layer.range(of: "FloatingCallPillView(callManager")?.lowerBound)
        let mini = try XCTUnwrap(layer.range(of: "MiniAudioPlayerBar(")?.lowerBound)
        let banner = try XCTUnwrap(layer.range(of: "PlayerBannerSlot(")?.lowerBound)
        XCTAssertLessThan(pill, mini)
        XCTAssertLessThan(mini, banner, "l'appel prime, puis l'audio, puis la bannière")
        XCTAssertTrue(layer.contains("audioBarContext == nil"), "la bannière cède quand l'audio AFFICHÉ est là")
        XCTAssertTrue(layer.contains("banner: bannerSurface"), "la bande de la barre d'état reprend l'aplat de la bannière")
    }

    func test_bothRootsTellTheLayerWhetherTheScreenHostsTheBanner() throws {
        for root in ["Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
                     "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift"] {
            let text = try source(root)
            XCTAssertTrue(text.contains("playerBannerHosted:"), "\(root) doit dire à la couche si l'écran porte la bannière")
            XCTAssertTrue(text.contains("router.push(.progression)"), "\(root) : un toucher ouvre Progression")
        }
    }

    func test_theSlotWakesNeitherTheCacheNorTheNetwork_unlessTheScreenHostsTheBanner() throws {
        let host = try source("Meeshy/Features/Main/Game/PlayerBannerHost.swift")
        XCTAssertTrue(host.contains("guard isHosted, !hidden else { return }"),
                      "un fil, Progression ou une visionneuse ne lisent ni le cache ni le réseau ; « Jeu masqué » non plus")
        XCTAssertTrue(host.contains("hosted: isHosted"), "le retour sur un écran principal relance la lecture")
    }

    func test_theSlotNeverReadsTheWindowInsetsItself() throws {
        let host = try source("Meeshy/Features/Main/Game/PlayerBannerHost.swift")
        XCTAssertFalse(host.contains("DeviceLayout.safeAreaTop"), "lire l'encart de la fenêtre clé depuis l'intérieur fige la vue (#8772) : il est mesuré par préférence")
        XCTAssertTrue(host.contains("withAnimation(TopChromeBarMotion.animation"), "la sortie s'anime par l'état AFFICHÉ, pas par une .animation(value:)")
        XCTAssertFalse(host.contains(".animation(TopChromeBarMotion"), "une .animation(value:) n'anime pas une sortie (#9048)")
    }
}
