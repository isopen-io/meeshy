import XCTest
import CoreGraphics
@testable import Meeshy

/// **Le cadrage final est une fenêtre dans la source** (#9347, spec § 3.3 / § 4.1).
@MainActor
final class ComposerFramingTests: XCTestCase {

    private let source = CGRect(x: 0, y: 0, width: 300, height: 400)
    private let portrait: CGFloat = 9.0 / 16.0

    func test_window_identity_fillsTheAspectCentered() {
        let fenetre = ComposerFraming.identity.window(in: source, aspect: portrait)
        XCTAssertEqual(fenetre.width, 225, accuracy: 0.001)
        XCTAssertEqual(fenetre.height, 400, accuracy: 0.001)
        XCTAssertEqual(fenetre.minX, 37.5, accuracy: 0.001)
        XCTAssertEqual(fenetre.minY, 0, accuracy: 0.001)
    }

    func test_window_scaleTwo_halvesTheWindowAroundTheCenter() {
        let fenetre = ComposerFraming(center: CGPoint(x: 0.5, y: 0.5), scale: 2).window(in: source, aspect: portrait)
        XCTAssertEqual(fenetre.width, 112.5, accuracy: 0.001)
        XCTAssertEqual(fenetre.height, 200, accuracy: 0.001)
        XCTAssertEqual(fenetre.midX, 150, accuracy: 0.001)
        XCTAssertEqual(fenetre.midY, 200, accuracy: 0.001)
    }

    func test_window_centerOutsideTheSource_staysInsideNeverAnEmptyEdge() {
        let fenetre = ComposerFraming(center: CGPoint(x: 1.4, y: -0.3), scale: 2).window(in: source, aspect: portrait)
        XCTAssertEqual(fenetre.maxX, source.maxX, accuracy: 0.001)
        XCTAssertEqual(fenetre.minY, source.minY, accuracy: 0.001)
    }

    func test_window_scaleBelowOne_isClampedToFill() {
        let fenetre = ComposerFraming(center: CGPoint(x: 0.5, y: 0.5), scale: 0.2).window(in: source, aspect: portrait)
        XCTAssertEqual(fenetre.height, 400, accuracy: 0.001, "dézoomer s'arrête au remplissage : jamais de bande vide")
    }

    func test_panned_fingerMovesRight_windowMovesLeft() {
        let depart = ComposerFraming(center: CGPoint(x: 0.5, y: 0.5), scale: 2)
        let suivi = depart.panned(by: CGSize(width: 50, height: 0), viewSize: CGSize(width: 200, height: 355),
                                  source: source, aspect: portrait)
        XCTAssertEqual(suivi.center.x, 0.5 - 0.25 * 112.5 / 300, accuracy: 0.0001)
        XCTAssertEqual(suivi.center.y, 0.5, accuracy: 0.0001)
    }

    func test_panned_beyondTheEdge_settlesOnTheEdgeAndDoesNotAccumulate() {
        let depart = ComposerFraming(center: CGPoint(x: 0.5, y: 0.5), scale: 2)
        let loin = depart.panned(by: CGSize(width: -5_000, height: 0), viewSize: CGSize(width: 200, height: 355),
                                 source: source, aspect: portrait)
        let retour = loin.panned(by: CGSize(width: 10, height: 0), viewSize: CGSize(width: 200, height: 355),
                                 source: source, aspect: portrait)
        XCTAssertLessThan(retour.center.x, loin.center.x, "un retour se sent tout de suite, sans « dette » de glissé")
    }

    func test_zoomed_isClampedToTheScaleRange() {
        let zoome = ComposerFraming.identity.zoomed(by: 10, source: source, aspect: portrait)
        XCTAssertEqual(zoome.scale, ComposerFraming.scaleRange.upperBound)
        XCTAssertFalse(zoome.isIdentity)
    }
}
