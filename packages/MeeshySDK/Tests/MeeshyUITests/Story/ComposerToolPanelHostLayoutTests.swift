import XCTest
@testable import MeeshyUI

/// Le panel timeline occupe TOUTE la largeur de la sheet (capture user
/// 2026-07-20 : le transport et les lanes étaient posés avec une marge
/// gauche/droite héritée du conteneur commun des outils du band).
final class ComposerToolPanelHostLayoutTests: XCTestCase {

    func test_horizontalPadding_timelineIsEdgeToEdge() {
        XCTAssertEqual(ComposerToolPanelHost.horizontalPadding(for: .timeline), 0)
    }

    func test_horizontalPadding_otherToolsKeepInset() {
        for tool in [StoryToolMode.media, .audio, .drawing, .text, .texture, .filters] {
            XCTAssertEqual(ComposerToolPanelHost.horizontalPadding(for: tool), 16,
                           "L'outil \(tool) garde l'inset lisible de 16 pt")
        }
    }

    // MARK: - Hauteur d'ouverture du band (user 2026-07-30 : « rien n'est coupé »)
    //
    // `composerBandHeight` (état du grabber) était semée à 280 et appliquée
    // telle quelle à TOUS les panneaux via `panelHeightOverride`. La timeline,
    // qui demande 392 pt (opérations + transport + scrubber + 3 pistes +
    // footer), se retrouvait donc dans une fenêtre de 230 pt : son bas partait
    // hors de l'écran. Le band s'ouvre désormais à la hauteur de l'outil.

    func test_bandHeight_matchesEachToolDesignHeight() {
        for tool in StoryToolMode.selectableCases {
            XCTAssertEqual(StoryComposerView.bandHeight(for: tool),
                           ComposerToolPanelHost.defaultPanelHeight(for: tool),
                           "L'outil \(tool) s'ouvre à sa hauteur de conception")
        }
    }

    func test_bandHeight_timelineGetsItsFullHeight() {
        XCTAssertEqual(StoryComposerView.bandHeight(for: .timeline), 392,
                       "La timeline ne s'ouvre plus dans la fenêtre de 280 pt héritée du grabber")
    }

    func test_bandHeight_staysWithinGrabberBounds() {
        for tool in StoryToolMode.selectableCases {
            let height = StoryComposerView.bandHeight(for: tool)
            XCTAssertGreaterThanOrEqual(height, StoryComposerView.composerBandMinHeight)
            XCTAssertLessThanOrEqual(height, StoryComposerView.composerBandMaxHeight)
        }
    }
}
