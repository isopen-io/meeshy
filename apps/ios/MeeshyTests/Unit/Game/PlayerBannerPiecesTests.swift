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
                XCTAssertGreaterThanOrEqual(frame.width, PlayerBannerView.pieceTarget - 0.5, "\(Int(width)) pt · \(piece)")
                XCTAssertGreaterThanOrEqual(frame.height, PlayerBannerView.pieceTarget - 0.5, "\(Int(width)) pt · \(piece)")
                XCTAssertLessThanOrEqual(frame.maxX, width + 0.5, "\(Int(width)) pt · \(piece) tient dans la largeur")
            }
        }
    }
}
