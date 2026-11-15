import XCTest
import SwiftUI
@testable import MeeshyUI

/// Avant iOS 18, `gameOnScreen` jugeait la visibilité contre la fenêtre CLÉ de la scène active. Une vue posée hors
/// d'une fenêtre étroite (Stage Manager, fenêtre détachée) se disait visible si la fenêtre clé était plus large.
/// Elle se juge désormais contre la fenêtre qui la porte (`\.sceneWindowSize`).
@MainActor
final class GameOnScreenWindowTests: XCTestCase {

    private final class Seen { var visible: Bool? }

    func test_aViewBeyondItsNarrowWindow_isNotOnScreen() throws {
        if #available(iOS 18.0, *) {
            throw XCTSkip("iOS 18+ : `onScrollVisibilityChange` du système juge la visibilité")
        }
        let seen = Seen()
        let root = ZStack(alignment: .topLeading) {
            Color.clear
            Color.blue.frame(width: 60, height: 100)
                .gameOnScreen { seen.visible = $0 }
                .padding(.leading, 330)
        }
        .frame(width: 320, height: 600, alignment: .topLeading)
        .publishingSceneWindowSize()

        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 600))
        window.rootViewController = UIHostingController(rootView: root)
        window.isHidden = false
        window.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        defer { window.isHidden = true }

        XCTAssertEqual(seen.visible, false, "hors de sa fenêtre, la vue n'est pas à l'écran")
    }
}
