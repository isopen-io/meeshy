import XCTest
@testable import Meeshy
import MeeshySDK

/// Le héro de frappe, le compteur de Meeshes et le détail de ligue (#9537, #9541) : UNE section de frappe, la scène
/// de Mee et Meo dans la feuille du compteur, le compteur qui monte APRÈS l'animation, la ligue AVANT la frappe.
@MainActor
final class GameMintHeroTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ relative: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    // MARK: - Le séquencement : l'animation d'abord, le compteur ensuite

    func test_theCounterHoldsTheImageOfBeforeWhileTheSceneIsPlaying() {
        var sequence = GameMintSequence<Int>()
        XCTAssertEqual(sequence.shown(live: 9), 9, "au repos, le compteur montre le vivant")
        XCTAssertTrue(sequence.begin(holding: 9))
        XCTAssertTrue(sequence.isStriking)
        XCTAssertEqual(sequence.shown(live: 10), 9, "la mise à jour optimiste est déjà là (10), l'écran montre encore 9 : pas d'incrément avant la fin")
        XCTAssertEqual(sequence.shown(live: 10), 9)
    }

    func test_theCounterRisesOnlyWhenTheSceneIsFinished() {
        var sequence = GameMintSequence<Int>()
        sequence.begin(holding: 9)
        sequence.finish()
        XCTAssertFalse(sequence.isStriking)
        XCTAssertEqual(sequence.shown(live: 10), 10, "la scène finie, le compteur lâche la valeur vivante")
    }

    func test_aRefusedMintNeverMovesTheCounter() {
        var sequence = GameMintSequence<Int>()
        sequence.begin(holding: 9)
        XCTAssertEqual(sequence.shown(live: 9), 9, "le serveur refuse pendant la scène : l'état est restauré, le compteur n'a jamais bougé")
        sequence.finish()
        XCTAssertEqual(sequence.shown(live: 9), 9, "et la scène finie, il reste à 9")
    }

    func test_aSecondTouchWhileTheSceneIsPlayingDoesNotReplayIt() {
        var sequence = GameMintSequence<Int>()
        XCTAssertTrue(sequence.begin(holding: 9))
        let generation = sequence.generation
        XCTAssertFalse(sequence.begin(holding: 10), "une frappe se joue déjà")
        XCTAssertEqual(sequence.generation, generation, "la minuterie de l'hôte ne repart pas")
        XCTAssertEqual(sequence.shown(live: 11), 9, "ce qu'on retient reste l'image d'avant la PREMIÈRE frappe")
    }

    func test_eachMintRestartsTheTimer() {
        var sequence = GameMintSequence<Int>()
        sequence.begin(holding: 9)
        sequence.finish()
        sequence.begin(holding: 10)
        XCTAssertEqual(sequence.generation, 2)
    }

    func test_theSceneLastsAsLongAsTheBoardSays_andAFadeUnderReducedMotion() {
        XCTAssertEqual(GameMintSequence<Int>.duration(reduceMotion: false), GameTimeline.strikeDuration)
        XCTAssertEqual(GameMintSequence<Int>.duration(reduceMotion: true), GameTimeline.reducedDuration)
    }

    func test_theFrameHeldCarriesTheBalanceAndTheNextCoin() {
        let before = GameMintFrame(meesh: EngagementMeeshProgress(payload: GameFixture.meesh(balance: 9)), next: GameMintNext(number: 13, edition: .silver))
        let after = GameMintFrame(meesh: EngagementMeeshProgress(payload: GameFixture.meesh(balance: 10)), next: GameMintNext(number: 14, edition: .silver))
        var sequence = GameMintSequence<GameMintFrame>()
        sequence.begin(holding: before)
        XCTAssertEqual(sequence.shown(live: after).meesh.balance, 9)
        XCTAssertEqual(sequence.shown(live: after).next?.number, 13, "la scène grave la pièce n° 13, pas la suivante déjà annoncée")
        sequence.finish()
        XCTAssertEqual(sequence.shown(live: after).meesh.balance, 10)
    }

    // MARK: - La pièce que la scène montre (#9537)

    private func frame(balance: Int, next: Int, canMint: Bool = true) -> GameMintFrame {
        GameMintFrame(
            meesh: EngagementMeeshProgress(payload: GameFixture.meesh(balance: balance, debitable: canMint ? 12_180 : 0)),
            next: GameMintNext(number: next, edition: .silver)
        )
    }

    func test_beforeAnyStrike_theSceneShowsTheNextCoinOnItsObverse() {
        let scene = GameMintStrike.scene(shown: frame(balance: 9, next: 13), struck: nil, isStriking: false, play: 0, failed: false)
        XCTAssertEqual(scene, GameMintStrike(number: 13, edition: .silver, play: 0, restsReversed: false))
    }

    func test_whileStriking_theSceneEngravesTheHeldCoin() {
        let struck = GameMintNext(number: 13, edition: .silver)
        let scene = GameMintStrike.scene(shown: frame(balance: 9, next: 13), struck: struck, isStriking: true, play: 1, failed: false)
        XCTAssertEqual(scene, GameMintStrike(number: 13, edition: .silver, play: 1, restsReversed: false))
    }

    func test_onceStruck_theCoinRestsOnTheNumberItWasStruckWith_notOnTheNextOne() {
        let struck = GameMintNext(number: 13, edition: .silver)
        let scene = GameMintStrike.scene(shown: frame(balance: 10, next: 14), struck: struck, isStriking: false, play: 1, failed: false)
        XCTAssertEqual(scene?.number, 13, "la pièce posée sur son revers est la n° 13 qu'on vient de frapper — la n° 14 n'existe pas encore")
        XCTAssertEqual(scene?.restsReversed, true)
    }

    func test_theLastAffordableStrike_keepsItsStruckCoinOnScreen() {
        let struck = GameMintNext(number: 13, edition: .silver)
        let scene = GameMintStrike.scene(shown: frame(balance: 10, next: 14, canMint: false), struck: struck, isStriking: false, play: 1, failed: false)
        XCTAssertEqual(scene, GameMintStrike(number: 13, edition: .silver, play: 1, restsReversed: true),
                       "plus assez de points pour la suivante : la pièce frappée ne disparaît pas avec le bouton")
    }

    func test_aRefusedStrike_putsTheNextCoinBackOnItsObverse() {
        let struck = GameMintNext(number: 13, edition: .silver)
        let scene = GameMintStrike.scene(shown: frame(balance: 9, next: 13), struck: struck, isStriking: false, play: 1, failed: true)
        XCTAssertEqual(scene, GameMintStrike(number: 13, edition: .silver, play: 1, restsReversed: false),
                       "le serveur a refusé : rien n'a été frappé, la pièce ne montre pas de revers numéroté")
    }

    func test_withoutPointsNorStrike_thereIsNoScene() {
        XCTAssertNil(GameMintStrike.scene(shown: frame(balance: 9, next: 13, canMint: false), struck: nil, isStriking: false, play: 0, failed: false))
        let unknown = GameMintFrame(meesh: EngagementMeeshProgress(payload: GameFixture.meesh()), next: nil)
        XCTAssertNil(GameMintStrike.scene(shown: unknown, struck: nil, isStriking: false, play: 0, failed: false), "un ancien serveur ne dit pas la prochaine pièce : pas de scène")
    }

    func test_theCounterSheetRemembersTheCoinItStruck() throws {
        let text = try source("Meeshy/Features/Main/Views/ProgressionMeeshEntry.swift")
        XCTAssertTrue(text.contains("GameMintStrike.scene(shown: shown, struck: struck"), "la scène est décidée par la fonction pure")
        XCTAssertTrue(text.contains("struck = next"), "le toucher retient la pièce qu'il frappe")
    }

    // MARK: - Le jour de jeu est celui du compte (#9539)

    func test_theDailyMissionsEndWithTheAccountDay_notTheDeviceDay() throws {
        let text = try source("Meeshy/Features/Main/Game/GameMissionsView.swift")
        XCTAssertTrue(text.contains("GameMissionClock.endOfDay(missions.dayKey, timezone: accountTimezone)"),
                      "la fin du jour se lit dans le fuseau du compte, celui où la passerelle découpe le jour de jeu")
    }

    // MARK: - La feuille du compteur joue la frappe

    func test_theCounterSheetPlaysMeeAndMeoStriking_andTheCounterReadsTheHeldImage() throws {
        let text = try source("Meeshy/Features/Main/Views/ProgressionMeeshEntry.swift")
        XCTAssertTrue(text.contains("MintStrikeScene("), "Mee et Meo frappent dans la feuille du compteur")
        XCTAssertTrue(text.contains("GameMintSequence<GameMintFrame>"), "le compteur est séquencé")
        XCTAssertTrue(text.contains("Text(\"\\(shown.meesh.balance)\")"), "le compteur lit l'image retenue, jamais le solde vivant")
        XCTAssertTrue(text.contains("sequence.finish()"), "le compteur lâche le vivant à la fin de la scène")
        XCTAssertTrue(text.contains("sequence.begin(holding:"), "le toucher retient l'image d'avant")
    }

    func test_theCounterIsOnlyIncrementedByTheFinishOfTheScene_neverByTheTouch() throws {
        let text = try source("Meeshy/Features/Main/Views/ProgressionMeeshEntry.swift")
        let touch = try XCTUnwrap(text.range(of: "private func startStrike()"))
        let finish = try XCTUnwrap(text.range(of: "sequence.finish()"))
        XCTAssertLessThan(touch.lowerBound, finish.lowerBound)
        let startBody = String(text[touch.lowerBound..<(text.range(of: "var body: some View", range: touch.upperBound..<text.endIndex)?.lowerBound ?? text.endIndex)])
        XCTAssertFalse(startBody.contains("finish()"), "le toucher ne lâche rien : seule la fin de la scène le fait")
    }

    // MARK: - Une seule section Héro de frappe (#9537)

    func test_thereIsOneMintHero_theLevelHeroNoLongerCarriesOne() throws {
        let hero = try source("Meeshy/Features/Main/Game/GameHeroView.swift")
        XCTAssertFalse(hero.contains("GameHeroMint"), "le héro de niveau ne porte plus de « Comment frapper »")
        let parts = try source("Meeshy/Features/Main/Game/GameHeroParts.swift")
        XCTAssertFalse(parts.contains("struct GameHeroMint"), "le doublon est supprimé, pas masqué")
        let section = try source("Meeshy/Features/Main/Game/GameSection.swift")
        XCTAssertEqual(section.components(separatedBy: "GameMintPreviewView(").count - 1, 1, "UN héro de frappe dans la section du jeu")
    }

    // MARK: - Le détail de ligue AVANT la frappe (#9541)

    func test_theLeagueDetailComesBeforeTheMintHero() throws {
        let section = try source("Meeshy/Features/Main/Game/GameSection.swift")
        let league = try XCTUnwrap(section.range(of: "GameLeagueDetailCard.make(")?.lowerBound)
        let mint = try XCTUnwrap(section.range(of: "GameMintPreviewView(")?.lowerBound)
        XCTAssertLessThan(league, mint, "le détail de ligue se place avant le bouton de frappe")
    }

    private func block(access: LeagueAccess, current: GameLeagueBlock.Current?) -> GameLeagueBlock {
        GameLeagueBlock(
            unlocked: true, access: access, pseudonym: nil, weekKey: "2026-W41",
            closes: .init(dayKey: "2026-10-11", minuteOfDay: 1200), current: current,
            friends: .init(rank: 1, size: 1, weekPoints: 0)
        )
    }

    private let placed = GameLeagueBlock.Current(
        league: .jade, groupId: "g1", groupSize: 30, rank: 4, weekPoints: 120, zone: .safe, cup: nil, pointsToPromotion: 5
    )

    func test_theLeagueDetailShowsOnlyForAnOpenLeagueWithAGroup() {
        XCTAssertEqual(GameLeagueDetail.current(of: block(access: .open, current: placed)), placed)
        XCTAssertNil(GameLeagueDetail.current(of: block(access: .open, current: nil)), "pas encore de groupe : rien")
        for access in [LeagueAccess.locked, .minor, .consentRequired] {
            XCTAssertNil(GameLeagueDetail.current(of: block(access: access, current: placed)), "\(access) : la porte plus bas dit pourquoi")
        }
        XCTAssertNil(GameLeagueDetail.current(of: nil), "un ancien serveur ne sert pas la ligue")
    }

    func test_theLeagueDetailSaysGemPlaceWeekPointsAndTheClosing() throws {
        let text = try source("Meeshy/Features/Main/Game/GameLeagueDetailCard.swift")
        for piece in ["LeagueGemView(", "leagueRankLine(", "leagueDetailWeek(points:", "leagueCloses(remaining:"] {
            XCTAssertTrue(text.contains(piece), "le détail de ligue dit « \(piece) »")
        }
    }
}
