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
                                        meeshes: 3, rank: .init(rank: .voix, division: .ii), league: .init(league: .jade, place: 4),
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
            for piece in full.pieces {
                let frame = try XCTUnwrap(screen.frame(of: "game.player_banner.\(piece.rawValue)", borne: 5),
                                          "\(Int(width)) pt : la pièce \(piece) est un élément à part")
                let target = PlayerBannerView.cornerPieces.contains(piece) ? PlayerBannerView.cornerTarget : PlayerBannerView.pieceTarget
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
            for piece in full.pieces {
                let frame = try XCTUnwrap(screen.frame(of: "game.player_banner.\(piece.rawValue)", borne: 5))
                XCTAssertLessThanOrEqual(frame.maxY, level.minY + PlayerBannerView.minimumHeight + 0.5,
                                         "\(Int(width)) pt · \(piece) reste dans la rangée de l'anneau, jamais dessous")
            }
        }
    }

    func test_theCorner_putsTheMeeshesAbove_andTheRankWithTheMissionBelow_afterTheGauge() throws {
        let screen = mounted(width: 390)
        let sparks = try XCTUnwrap(screen.frame(of: "game.player_banner.sparks", borne: 5))
        let meesh = try XCTUnwrap(screen.frame(of: "game.player_banner.meesh", borne: 5))
        let rank = try XCTUnwrap(screen.frame(of: "game.player_banner.rank", borne: 5))
        let mission = try XCTUnwrap(screen.frame(of: "game.player_banner.mission", borne: 5))
        XCTAssertLessThanOrEqual(meesh.maxY, rank.minY + 0.5, "les Meeshes en haut, le rang dessous")
        XCTAssertEqual(rank.midY, mission.midY, accuracy: 1, "le rang et la mission sur la même ligne")
        XCTAssertLessThanOrEqual(sparks.maxX, min(meesh.minX, rank.minX) + 0.5, "l'angle se pose au bout de la jauge")
        XCTAssertEqual(meesh.maxX, mission.maxX, accuracy: 1, "l'angle s'aligne à droite")
    }

    func test_theBannerIs48ptTall_likeTheWeb() {
        XCTAssertEqual(PlayerBannerView.minimumHeight, 48)
        XCTAssertEqual(PlayerBannerView.cornerTarget, 24)
        XCTAssertEqual(PlayerBannerView.cornerPieces, [.meesh, .rank, .mission])
    }
}
