import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// Le bandeau d'ouverture (#10846) : chaque pièce a SA phrase de lecteur d'écran, et son toucher ouvre SA fiche —
/// sur iPhone comme sur iPad.
@MainActor
final class PlayerBannerPiecesTests: XCTestCase {

    private let full = GamePlayerBanner(level: 12, tier: .lueur, progress: 0.4, score: 900, nextLevel: 13, pointsToNext: 200,
                                        meeshes: 3, rank: .init(rank: .voix, division: .ii, glory: 1700, progress: 0.6, gloryMissing: 466,
                                                               next: GloryStep(rank: .voix, division: .i, division5: .i, minGlory: 2166)),
                                        league: .init(league: .jade, place: 4),
                                        flame: .init(form: .braise, days: 5), trophies: 2,
                                        dailyMission: .init(done: 1, total: 3), season: .init(number: 1))

    func test_everyPieceHasItsOwnSpokenLabel() {
        let texts = PlayerBannerCopy.texts(for: full)
        for piece in full.pieces {
            XCTAssertFalse((texts.pieceLabels[piece] ?? "").isEmpty, "\(piece) : un élément VoiceOver par pièce")
        }
        XCTAssertEqual(Set(texts.pieceLabels.values).count, full.pieces.count, "chaque pièce dit autre chose")
        XCTAssertNotNil(texts.trophies)
        XCTAssertNotNil(texts.mission)
        XCTAssertNotNil(texts.season)
    }

    func test_bothRoots_openThePiecesConcept() throws {
        for path in ["Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
                     "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift"] {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
            XCTAssertTrue(code.contains("onPlayerBannerTap: { router.openGame(at: .progressionConcept($0.concept)) }"), path)
        }
    }

    func test_theSlot_handsEachPieceToTheBanner_insteadOfOneButton() throws {
        let host = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Game/PlayerBannerHost.swift"))
        XCTAssertTrue(host.contains("onSelect: { piece in"))
        XCTAssertFalse(host.contains("onTap()"), "plus un seul bouton pour tout le bandeau")
    }

    // MARK: - Mesuré, sur iPhone et sur iPad : neuf boutons, neuf éléments VoiceOver, 44 pt chacun

    private func mounted(width: CGFloat) -> RenderedScreen {
        let banner = full
        return RenderedScreen(
            PlayerBannerView(model: banner, texts: PlayerBannerCopy.texts(for: banner),
                             palette: PlayerBannerStyle.palette(tier: banner.tier, isDark: false),
                             accessibilityLabel: PlayerBannerCopy.accessibilityLabel(for: banner), onSelect: { _ in })
                .frame(width: width),
            size: CGSize(width: width, height: 400))
    }

    func test_onIPhoneAndIPad_eachPieceIsItsOwnTappableElement() throws {
        for width: CGFloat in [375, 1024] {
            let screen = mounted(width: width)
            for piece in full.pieces where PlayerBannerView.compactPieces.contains(piece) {
                let frame = try XCTUnwrap(screen.frame(of: "game.player_banner.\(piece.rawValue)", borne: 5),
                                          "\(Int(width)) pt : la pièce \(piece) est un élément à part")
                let target = PlayerBannerView.middlePieces.contains(piece) ? PlayerBannerView.cornerTarget : PlayerBannerView.pieceTarget
                XCTAssertGreaterThanOrEqual(frame.height, target - 0.5, "\(Int(width)) pt · \(piece)")
                XCTAssertGreaterThanOrEqual(frame.width, PlayerBannerView.cornerTarget - 0.5, "\(Int(width)) pt · \(piece)")
                XCTAssertLessThanOrEqual(frame.maxX, width + 0.5, "\(Int(width)) pt · \(piece) tient dans la largeur")
            }
        }
    }

    // MARK: - Compact (#11125) : une seule rangée, l'angle encadre la fin de la jauge

    func test_theBannerHoldsOnOneRow_noPieceFallsUnderTheGauge() throws {
        for width: CGFloat in [375, 430, 1024] {
            let screen = mounted(width: width)
            let level = try XCTUnwrap(screen.frame(of: "game.player_banner.level", borne: 5))
            for piece in full.pieces where PlayerBannerView.compactPieces.contains(piece) {
                let frame = try XCTUnwrap(screen.frame(of: "game.player_banner.\(piece.rawValue)", borne: 5))
                XCTAssertLessThanOrEqual(frame.maxY, level.minY + PlayerBannerView.minimumHeight + 0.5,
                                         "\(Int(width)) pt · \(piece) reste dans la rangée de l'anneau, jamais dessous")
            }
        }
    }

    func test_theMiddle_holdsTheFlameTheMeeshesAndTheMission_betweenTheSparksAndTheGlory() throws {
        let screen = mounted(width: 390)
        let sparks = try XCTUnwrap(screen.frame(of: "game.player_banner.sparks", borne: 5))
        let rank = try XCTUnwrap(screen.frame(of: "game.player_banner.rank", borne: 5))
        for piece in PlayerBannerView.middlePieces {
            let frame = try XCTUnwrap(screen.frame(of: "game.player_banner.\(piece.rawValue)", borne: 5), "\(piece)")
            XCTAssertGreaterThanOrEqual(frame.minX, sparks.maxX - 0.5, "\(piece) après les étincelles")
            XCTAssertLessThanOrEqual(frame.maxX, rank.minX + 0.5, "\(piece) avant la Gloire")
        }
        let flame = try XCTUnwrap(screen.frame(of: "game.player_banner.flame", borne: 5))
        let mission = try XCTUnwrap(screen.frame(of: "game.player_banner.mission", borne: 5))
        XCTAssertLessThanOrEqual(flame.maxY, mission.minY + 0.5, "la Flamme en haut, la mission dessous")
    }

    func test_theGloryGauge_closesTheRow_onTheRight() throws {
        let screen = mounted(width: 390)
        let rank = try XCTUnwrap(screen.frame(of: "game.player_banner.rank", borne: 5))
        XCTAssertGreaterThanOrEqual(rank.width, 80, "le rang porte son nom et sa jauge, pas un blason seul")
        XCTAssertEqual(rank.maxX, 390 - 12, accuracy: 2, "la Gloire ferme la rangée à droite")
    }

    func test_theGloryTexts_sayTheRank_andWhatRemainsTowardTheNext() {
        let texts = PlayerBannerCopy.texts(for: full)
        XCTAssertEqual(texts.rank, GameCopy.rankLabel(.voix, division5: .ii))
        XCTAssertEqual(texts.gloryMissing, GameText.bannerGloryMissing(points: GameCopy.compactCount(466), rank: GameCopy.rankLabel(.voix, division5: .i)))
        XCTAssertFalse((texts.gloryMissing ?? "").localizedCaseInsensitiveContains("encore"), "X vers Y, sans « encore »")
    }

    func test_towardTheNextRank_theGloryTextNamesIt() {
        let banner = GamePlayerBanner(level: 12, tier: .lueur, progress: 0.4, score: 900, nextLevel: 13, pointsToNext: 200,
                                      rank: .init(rank: .voix, division: .i, glory: 2900, progress: 0.9, gloryMissing: 100,
                                                  next: GloryStep(rank: .conteur, division: .iii, division5: .v, minGlory: 3000)))
        XCTAssertEqual(PlayerBannerCopy.texts(for: banner).gloryMissing,
                       GameText.bannerGloryMissing(points: GameCopy.compactCount(100), rank: GameCopy.rankLabel(.conteur, division5: .v)))
    }

    func test_atTheTopOfTheLadder_theGloryTotalReplacesWhatRemains() {
        let top = GamePlayerBanner(level: 12, tier: .lueur, progress: 0.4, score: 900, nextLevel: 13, pointsToNext: 200,
                                   rank: .init(rank: .legende, division: .i, glory: 990_000, progress: 1, gloryMissing: nil, next: nil))
        XCTAssertEqual(PlayerBannerCopy.texts(for: top).gloryMissing, GameText.bannerGloryTotal(points: GameCopy.compactCount(990_000)))
    }

    func test_theBannerReadsTheGloryFromTheServedBlock() throws {
        let banner = GamePlayerBanner(level: 12, tier: .lueur, progress: 0.4, score: 900, nextLevel: 13, pointsToNext: 200,
                                      rank: .init(rank: .voix, division: .ii, glory: 1700, progress: 0.6, gloryMissing: 466, next: nil))
        let rank = try XCTUnwrap(banner.rank)
        XCTAssertEqual(rank.glory, 1700)
        XCTAssertEqual(rank.progress, 0.6)
        XCTAssertEqual(rank.gloryMissing, 466)
    }

    func test_aBigFigure_isCompact_aSmallOneStaysWhole() {
        XCTAssertEqual(GameCopy.compactCount(5_443), GameCopy.formatCount(5_443))
        XCTAssertEqual(GameCopy.compactCount(12_000), 12_000.formatted(.number.notation(.compactName).precision(.fractionLength(0...1))))
        XCTAssertLessThan(GameCopy.compactCount(10_563).count, GameCopy.formatCount(10_563).count)
    }

    func test_trophiesAndSeason_leaveTheCompactRow() {
        XCTAssertEqual(PlayerBannerView.compactPieces, [.level, .sparks, .flame, .meesh, .mission, .league, .rank])
    }

    func test_theBannerIs48ptTall_likeTheWeb() {
        XCTAssertEqual(PlayerBannerView.minimumHeight, 48)
        XCTAssertEqual(PlayerBannerView.cornerTarget, 24)
        XCTAssertEqual(PlayerBannerView.middlePieces, [.flame, .meesh, .mission, .league])
    }
}
