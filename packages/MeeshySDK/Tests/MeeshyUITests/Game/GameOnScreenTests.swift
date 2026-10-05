import Testing
import CoreGraphics
@testable import MeeshyUI

/// Une animation qui boucle s'arrête hors de la zone visible (#9381) : dans un
/// `ScrollView` non paresseux, `onDisappear` ne vient jamais, c'est la frame qui le dit.
@MainActor
@Suite("Jeu Meeshy — visibilité des animations qui bouclent")
struct GameOnScreenTests {

    private let window = CGRect(x: 0, y: 0, width: 390, height: 844)

    @Test("une vue dans la fenêtre est visible")
    func insideTheWindowIsVisible() {
        #expect(GameOnScreen.isVisible(frame: CGRect(x: 20, y: 300, width: 64, height: 64), window: window))
    }

    @Test("une vue défilée sous le bord bas, ou au-dessus du bord haut, n'est plus visible")
    func scrolledOutIsNotVisible() {
        #expect(!GameOnScreen.isVisible(frame: CGRect(x: 20, y: 900, width: 64, height: 64), window: window))
        #expect(!GameOnScreen.isVisible(frame: CGRect(x: 20, y: -200, width: 64, height: 64), window: window))
    }

    @Test("une vue qui dépasse à peine du bord reste visible")
    func straddlingTheEdgeIsVisible() {
        #expect(GameOnScreen.isVisible(frame: CGRect(x: 20, y: 820, width: 64, height: 64), window: window))
    }
}
