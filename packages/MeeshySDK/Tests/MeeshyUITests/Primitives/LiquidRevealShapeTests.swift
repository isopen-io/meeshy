import XCTest
import SwiftUI
@testable import MeeshyUI

/// Verrouille la géométrie du `LiquidRevealShape` — l'atome de masque "vague
/// liquide" du reveal Reels. Tests purs (PAS `@MainActor`) : un `Shape` est de
/// la logique pure, et sous `defaultIsolation(MainActor)` un test `@MainActor`
/// ne pourrait pas appeler `path(in:)` (nonisolated).
///
/// Invariants garantis :
///  - progress = 0 → disque minuscule (≈ baseRadius) autour du `center`.
///  - progress = 1 → le path couvre TOUT le rect (les 4 coins sont dedans).
///  - `animatableData` get/set fait un round-trip exact sur `progress`.
final class LiquidRevealShapeTests: XCTestCase {

    private let rect = CGRect(x: 0, y: 0, width: 390, height: 844)

    // MARK: - progress = 0 → petit disque au center

    func test_progressZero_isSmallDiscAroundCenter() {
        let center = UnitPoint(x: 0.2, y: 0.1)
        let shape = LiquidRevealShape(center: center, progress: 0, baseRadius: 26, amplitude: 0, frequency: 8, phase: 0)
        let bounds = shape.path(in: rect).boundingRect

        let centerPoint = CGPoint(x: rect.width * center.x, y: rect.height * center.y)
        // Le disque reste minuscule (rayon ≈ baseRadius = 26 → diamètre ≈ 52).
        XCTAssertLessThan(bounds.width, 70, "progress=0 doit produire un petit disque, pas un plein écran")
        XCTAssertLessThan(bounds.height, 70)
        // Centré sur le point écran dérivé du UnitPoint.
        XCTAssertEqual(bounds.midX, centerPoint.x, accuracy: 2)
        XCTAssertEqual(bounds.midY, centerPoint.y, accuracy: 2)
    }

    // MARK: - progress = 1 → couvre tout le rect

    func test_progressOne_coversEntireRect() {
        // center off-coin pour que "couvrir tout" soit non-trivial (le rayon doit
        // atteindre le coin le plus éloigné).
        let shape = LiquidRevealShape(center: UnitPoint(x: 0.05, y: 0.05), progress: 1, baseRadius: 26, amplitude: 0, frequency: 8, phase: 0)
        let path = shape.path(in: rect)

        // Les 4 coins du rect doivent être à l'intérieur du path à pleine ouverture.
        XCTAssertTrue(path.contains(CGPoint(x: rect.minX + 1, y: rect.minY + 1)), "coin haut-gauche doit être couvert")
        XCTAssertTrue(path.contains(CGPoint(x: rect.maxX - 1, y: rect.minY + 1)), "coin haut-droit doit être couvert")
        XCTAssertTrue(path.contains(CGPoint(x: rect.minX + 1, y: rect.maxY - 1)), "coin bas-gauche doit être couvert")
        XCTAssertTrue(path.contains(CGPoint(x: rect.maxX - 1, y: rect.maxY - 1)), "coin bas-droit doit être couvert")
    }

    // MARK: - monotonie : le disque grandit avec progress

    func test_radiusGrowsMonotonicallyWithProgress() {
        func discWidth(_ p: Double) -> CGFloat {
            LiquidRevealShape(center: .center, progress: p, baseRadius: 26, amplitude: 0, frequency: 8, phase: 0)
                .path(in: rect).boundingRect.width
        }
        let w0 = discWidth(0)
        let w50 = discWidth(0.5)
        let w100 = discWidth(1)
        XCTAssertLessThan(w0, w50)
        XCTAssertLessThan(w50, w100)
    }

    // MARK: - animatableData round-trip

    func test_animatableData_roundTripsProgress() {
        var shape = LiquidRevealShape(center: .center, progress: 0.42, baseRadius: 26, amplitude: 10, frequency: 8, phase: 1.5)
        XCTAssertEqual(shape.animatableData, 0.42, accuracy: 0.0001)

        shape.animatableData = 0.77
        XCTAssertEqual(shape.progress, 0.77, accuracy: 0.0001)
    }

    // MARK: - amplitude wavy : un bord ondulé étend le boundingRect au-delà du cercle nu

    func test_nonZeroAmplitude_producesWavyEdgeLargerThanBareCircle() {
        let bare = LiquidRevealShape(center: .center, progress: 0.5, baseRadius: 26, amplitude: 0, frequency: 8, phase: 0)
            .path(in: rect).boundingRect
        let wavy = LiquidRevealShape(center: .center, progress: 0.5, baseRadius: 26, amplitude: 18, frequency: 8, phase: 0)
            .path(in: rect).boundingRect
        // Les crêtes de la vague poussent le contour vers l'extérieur.
        XCTAssertGreaterThan(wavy.width, bare.width)
        XCTAssertGreaterThan(wavy.height, bare.height)
    }
}
