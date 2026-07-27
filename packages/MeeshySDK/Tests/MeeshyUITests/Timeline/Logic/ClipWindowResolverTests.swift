import XCTest
@testable import MeeshyUI

/// Le résolveur est la SEULE règle de bornes d'une fenêtre de clip. Avant lui,
/// trois implémentations divergeaient : la barre tactile clampait la fin à la
/// durée de slide (rendant impossible d'allonger un clip en fin de slide), les
/// steppers ne clampaient que le plancher, les poignées de piste rien du tout.
final class ClipWindowResolverTests: XCTestCase {

    private typealias Resolver = ClipWindowResolver
    private func window(_ start: Float, _ duration: Float) -> Resolver.Window {
        Resolver.Window(start: start, duration: duration)
    }

    // MARK: - move : la durée est préservée

    func test_move_keepsDuration() {
        let r = Resolver.resolve(.move(to: 5), from: window(2, 3))
        XCTAssertEqual(r.start, 5, accuracy: 0.001)
        XCTAssertEqual(r.duration, 3, accuracy: 0.001, "Déplacer ne change jamais la durée.")
    }

    func test_move_beforeZero_clampsToZero() {
        let r = Resolver.resolve(.move(to: -4), from: window(2, 3))
        XCTAssertEqual(r.start, 0, accuracy: 0.001)
        XCTAssertEqual(r.duration, 3, accuracy: 0.001)
    }

    func test_move_pastCeiling_keepsWholeClipInside() {
        let r = Resolver.resolve(.move(to: 599), from: window(2, 3))
        XCTAssertEqual(r.end, Resolver.maximumEnd, accuracy: 0.001,
                       "Le clip entier doit tenir sous le plafond, pas seulement son début.")
        XCTAssertEqual(r.duration, 3, accuracy: 0.001)
    }

    // MARK: - setStart : la FIN est fixe

    func test_setStart_keepsEnd_shrinksDuration() {
        let r = Resolver.resolve(.setStart(4), from: window(2, 6))  // fin = 8
        XCTAssertEqual(r.start, 4, accuracy: 0.001)
        XCTAssertEqual(r.end, 8, accuracy: 0.001, "Trimmer le début ne bouge pas la fin.")
        XCTAssertEqual(r.duration, 4, accuracy: 0.001)
    }

    func test_setStart_pastEnd_stopsAtMinimumDuration() {
        let r = Resolver.resolve(.setStart(99), from: window(2, 6))  // fin = 8
        XCTAssertEqual(r.duration, Resolver.minimumDuration, accuracy: 0.001)
        XCTAssertEqual(r.end, 8, accuracy: 0.001)
    }

    func test_setStart_negative_clampsToZero() {
        let r = Resolver.resolve(.setStart(-3), from: window(2, 6))
        XCTAssertEqual(r.start, 0, accuracy: 0.001)
        XCTAssertEqual(r.duration, 8, accuracy: 0.001, "La fin reste à 8, la durée s'allonge d'autant.")
    }

    // MARK: - setEnd : le DÉBUT est fixe, et rien ne borne à la durée de slide

    func test_setEnd_keepsStart_growsDuration() {
        let r = Resolver.resolve(.setEnd(12), from: window(2, 3))
        XCTAssertEqual(r.start, 2, accuracy: 0.001)
        XCTAssertEqual(r.duration, 10, accuracy: 0.001)
    }

    /// LE cas qui était impossible : un clip qui finit à la fin de la slide
    /// pouvait être tiré nulle part. La slide dérive du contenu, donc c'est
    /// l'allongement du clip qui allonge la slide — jamais l'inverse.
    func test_setEnd_beyondAnySlideLength_isAllowed() {
        let r = Resolver.resolve(.setEnd(45), from: window(0, 6))
        XCTAssertEqual(r.duration, 45, accuracy: 0.001)
    }

    func test_setEnd_beforeStart_stopsAtMinimumDuration() {
        let r = Resolver.resolve(.setEnd(1), from: window(5, 3))
        XCTAssertEqual(r.start, 5, accuracy: 0.001)
        XCTAssertEqual(r.duration, Resolver.minimumDuration, accuracy: 0.001)
    }

    func test_setEnd_pastCeiling_clampsToMaximumEnd() {
        let r = Resolver.resolve(.setEnd(9999), from: window(10, 3))
        XCTAssertEqual(r.end, Resolver.maximumEnd, accuracy: 0.001)
    }

    // MARK: - setDuration : le DÉBUT est fixe

    func test_setDuration_keepsStart() {
        let r = Resolver.resolve(.setDuration(7), from: window(2, 3))
        XCTAssertEqual(r.start, 2, accuracy: 0.001)
        XCTAssertEqual(r.duration, 7, accuracy: 0.001)
    }

    func test_setDuration_zero_stopsAtMinimum() {
        let r = Resolver.resolve(.setDuration(0), from: window(2, 3))
        XCTAssertEqual(r.duration, Resolver.minimumDuration, accuracy: 0.001)
    }

    func test_setDuration_pastCeiling_clampsSoEndFits() {
        let r = Resolver.resolve(.setDuration(9999), from: window(100, 3))
        XCTAssertEqual(r.end, Resolver.maximumEnd, accuracy: 0.001)
    }

    // MARK: - Valeurs non finies

    /// Un `Float` non fini traversant les clamps produirait un `NaN` persistant
    /// dans le projet, invisible jusqu'à l'export. Le résolveur le refuse.
    func test_nonFiniteEdit_returnsWindowUnchanged() {
        let original = window(2, 3)
        XCTAssertEqual(Resolver.resolve(.move(to: .nan), from: original), original)
        XCTAssertEqual(Resolver.resolve(.setEnd(.infinity), from: original), original)
        XCTAssertEqual(Resolver.resolve(.setDuration(.nan), from: original), original)
        XCTAssertEqual(Resolver.resolve(.setStart(-.infinity), from: original), original)
    }
}
