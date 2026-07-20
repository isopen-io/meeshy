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
}
