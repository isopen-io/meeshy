import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// #19416 — « Son jeu » et « En direct » dans la Vitrine d'un autre : ce que l'app remet au SDK, en valeurs. Rien sous
/// « Jeu masqué », rien d'un autre membre, rien sans niveau servi ; un relevé de batterie périmé ne fait pas de tuile.
@MainActor
final class GameProfileBoardRulesTests: XCTestCase {

    private func standing(level: Int = 31, sparks: Int? = 2_410) -> GameStandingContent {
        let served = GameStanding(level: level, tier: .etincelle, prestige: 0, flame: .brasier, rank: .murmure,
                                  division: .iii, division5: .v, ladder: GameStandingLadder(level: level, tier: .etincelle),
                                  points: sparks, levelMaxLifetime: nil, sparks: sparks, sparksLifetime: nil, glory: nil)
        return GameStandingContent(standing: served, treasuryTier: nil)
    }

    private func entries(_ keys: [String]) -> [GameVisitorShowcase.Entry] {
        keys.compactMap { key in GameTrophyPresentation.of(key: key).map { GameVisitorShowcase.Entry(key: key, presentation: $0) } }
    }

    private let keys = ["trophy.league-cup.2026-10-26.jade.gold", "trophy.season-cup.3", "trophy.flame.365"]

    func test_board_servedStandingAndTrophies_readsLevelRankSparksAndTrophies() throws {
        let read = GameVisitorRead(userId: "u1", entries: entries(keys), standing: standing())

        let board = try XCTUnwrap(GameProfileBoardRules.board(read, for: "u1", hidden: false))

        XCTAssertEqual(board.level, 31)
        XCTAssertEqual(board.rankName, GameBannerBadgeModel.of(standing(), userId: "u1")?.rankName)
        XCTAssertEqual(board.sparks, GameCopy.formatCount(2_410))
        XCTAssertEqual(board.trophies.map(\.id), keys)
        XCTAssertEqual(board.lockedSlots, 2, "trois trophées sur cinq : deux places verrouillées")
    }

    func test_board_gameHidden_drawsNothing() {
        let read = GameVisitorRead(userId: "u1", entries: entries(keys), standing: standing())
        XCTAssertNil(GameProfileBoardRules.board(read, for: "u1", hidden: true))
    }

    func test_board_readOfAnotherMember_drawsNothing() {
        let read = GameVisitorRead(userId: "u2", entries: entries(keys), standing: standing())
        XCTAssertNil(GameProfileBoardRules.board(read, for: "u1", hidden: false))
    }

    func test_board_trophiesWithoutLevel_drawsNothing() {
        let read = GameVisitorRead(userId: "u1", entries: entries(keys), standing: nil)
        XCTAssertNil(GameProfileBoardRules.board(read, for: "u1", hidden: false))
    }

    func test_board_sparksNotServed_staysSilent() throws {
        let read = GameVisitorRead(userId: "u1", entries: [], standing: standing(sparks: nil))
        let board = try XCTUnwrap(GameProfileBoardRules.board(read, for: "u1", hidden: false))
        XCTAssertNil(board.sparks)
        XCTAssertEqual(board.lockedSlots, 0)
    }

    func test_medallion_eachMaterialHasItsGlyph() {
        XCTAssertEqual(GameProfileBoardRules.medallion(.league(.gold)).systemImage, "trophy.fill")
        XCTAssertEqual(GameProfileBoardRules.medallion(.season).systemImage, "crown.fill")
        XCTAssertEqual(GameProfileBoardRules.medallion(.flame).systemImage, "flame.fill")
    }

    // MARK: - En direct : la batterie

    private func battery(measuredAt: Date) -> BatteryReaderState {
        BatteryReaderState(userId: "u1", phase: .low, level: 64, charging: false, lowPower: false, measuredAt: measuredAt)
    }

    func test_liveBattery_freshReading_makesATile() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let tile = try XCTUnwrap(ProfileLiveSourceRules.battery(battery(measuredAt: now.addingTimeInterval(-60)), now: now))
        XCTAssertEqual(tile.level, 64)
        XCTAssertFalse(tile.isCharging)
    }

    func test_liveBattery_expiredOrAbsent_makesNoTile() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let expired = battery(measuredAt: now.addingTimeInterval(-BatteryContract.stateTtl - 1))
        XCTAssertNil(ProfileLiveSourceRules.battery(expired, now: now))
        XCTAssertNil(ProfileLiveSourceRules.battery(nil, now: now))
    }
}
