import Testing
import SwiftUI
@testable import MeeshyUI

/// Le lecteur de chemins SVG : les dessins de la planche sont écrits en `d="…"`
/// et ne doivent pas être recopiés en `addCurve` à la main.
@MainActor
@Suite("Jeu Meeshy — chemins SVG")
struct GameSVGPathTests {

    private func box(_ d: String) -> CGRect { GameSVGPath.make(d).boundingRect }

    private func close(_ lhs: CGRect, _ rhs: CGRect, tolerance: CGFloat = 0.01) -> Bool {
        abs(lhs.minX - rhs.minX) < tolerance && abs(lhs.minY - rhs.minY) < tolerance
            && abs(lhs.width - rhs.width) < tolerance && abs(lhs.height - rhs.height) < tolerance
    }

    @Test("les commandes relatives et absolues décrivent le même carré")
    func relativeAndAbsolute() {
        let expected = CGRect(x: 5, y: 5, width: 10, height: 10)
        #expect(close(box("M5 5 h10 v10 h-10 z"), expected))
        #expect(close(box("M5 5 H15 V15 H5 Z"), expected))
        #expect(close(box("M5,5 L15,5 L15,15 L5,15 z"), expected))
    }

    @Test("les paires qui suivent un M sont des L implicites")
    func implicitLineTo() {
        #expect(close(box("M0 0 10 0 10 10"), CGRect(x: 0, y: 0, width: 10, height: 10)))
        #expect(close(box("m0 0 10 0 0 10"), CGRect(x: 0, y: 0, width: 10, height: 10)))
    }

    @Test("un demi-cercle d'arc a pour boîte celle du disque coupé")
    func semicircleArc() {
        // La panse de la flamme : a18 18 0 0 1 -36 0 — du point (54,52) à (18,52), par le bas.
        let rect = box("M54 52 a18 18 0 0 1 -36 0")
        #expect(close(rect, CGRect(x: 18, y: 52, width: 36, height: 18), tolerance: 0.2))
    }

    @Test("le sens de l'arc suit le drapeau de balayage, pas le repère de SwiftUI")
    func arcSweepFlag() {
        let down = box("M54 52 a18 18 0 0 1 -36 0")
        let up = box("M54 52 a18 18 0 0 0 -36 0")
        #expect(down.maxY > 52 + 17)
        #expect(up.minY < 52 - 17)
    }

    @Test("les courbes cubiques relatives s'enchaînent depuis le point courant")
    func relativeCubic() {
        let rect = box("M0 0 c 10 0 10 10 0 10")
        #expect(rect.minX == 0)
        #expect(rect.maxX > 5 && rect.maxX < 10)
        #expect(close(CGRect(x: 0, y: rect.minY, width: 1, height: rect.height), CGRect(x: 0, y: 0, width: 1, height: 10)))
    }

    @Test("une chaîne mal formée s'arrête là où elle casse, sans planter")
    func malformedStopsEarly() {
        #expect(close(box("M0 0 L10 10 L"), CGRect(x: 0, y: 0, width: 10, height: 10)))
        #expect(GameSVGPath.make("").isEmpty)
        #expect(GameSVGPath.make("n'importe quoi").isEmpty)
    }

    @Test("les contours de l'écu et de la flamme se lisent en entier")
    func shippedShapes() {
        let shield = box("M14 10 h72 v38 c0 24 -16 37 -36 45 c-20 -8 -36 -21 -36 -45 z")
        #expect(close(shield, CGRect(x: 14, y: 10, width: 72, height: 83), tolerance: 1))
        let flame = box("M36 10 c 12 16 22 26 18 42 a18 18 0 0 1 -36 0 c -2 -12 8 -18 10 -28 c 4 6 6 10 8 12 c 2 -8 2 -16 0 -26 z")
        #expect(flame.minX > 17 && flame.maxX < 55)
        #expect(flame.minY >= 9.9 && flame.maxY > 69 && flame.maxY < 71)
    }
}
