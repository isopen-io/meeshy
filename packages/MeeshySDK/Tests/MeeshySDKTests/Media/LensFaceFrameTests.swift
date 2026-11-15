import CoreGraphics
import XCTest
@testable import MeeshySDK

/// #11299 — le visage se lit en 76 points avec son orientation, et sert les
/// déclencheurs d'une lens : bouche ouverte, yeux fermés, tête tournée, tête penchée.
/// Les fixtures sont des régions de repères telles que Vision les rend
/// (normalisées à la boîte du visage).
final class LensFaceFrameTests: XCTestCase {

    func test_triggers_aNeutralFace_triggersNothing() {
        XCTAssertTrue(LensFaceTriggers.evaluate(Self.face()).isEmpty)
    }

    func test_triggers_anOpenMouth() {
        XCTAssertEqual(LensFaceTriggers.evaluate(Self.face(mouthOpening: 0.6)), [.mouthOpen])
    }

    func test_triggers_closedEyes_needBothEyes() {
        XCTAssertEqual(LensFaceTriggers.evaluate(Self.face(eyeOpening: 0.05)), [.eyesClosed])
        XCTAssertTrue(LensFaceTriggers.evaluate(Self.face(leftEyeOpening: 0.05)).isEmpty, "un clin d'œil n'est pas des yeux fermés")
    }

    func test_triggers_headTurnedAndTilted_readTheOrientation() {
        XCTAssertEqual(LensFaceTriggers.evaluate(Self.face(yaw: 0.6)), [.headTurned])
        XCTAssertEqual(LensFaceTriggers.evaluate(Self.face(yaw: -0.6)), [.headTurned])
        XCTAssertEqual(LensFaceTriggers.evaluate(Self.face(roll: 0.5)), [.headTilted])
        XCTAssertTrue(LensFaceTriggers.evaluate(Self.face(yaw: nil, roll: nil)).isEmpty, "une orientation inconnue ne déclenche rien")
    }

    func test_frame_isTheFull76PointConstellation() {
        XCTAssertEqual(LensFaceFrame.constellationCount, 76)
        XCTAssertTrue(Self.face().hasFullConstellation)
        XCTAssertFalse(Self.face(points: 65).hasFullConstellation, "la constellation de 65 points n'est pas celle qu'on attend")
    }

    func test_opening_ofADegenerateRegion_isUnknown() {
        XCTAssertNil(LensFaceTriggers.opening(of: []))
        XCTAssertNil(LensFaceTriggers.opening(of: [CGPoint(x: 0.5, y: 0.5)]))
    }

    // MARK: - Fixtures

    /// Une région en ellipse : `opening` = hauteur / largeur.
    private static func region(centerX: CGFloat, centerY: CGFloat, width: CGFloat, opening: CGFloat, count: Int = 8) -> [CGPoint] {
        (0..<count).map { index in
            let angle = CGFloat(index) / CGFloat(count) * 2 * .pi
            return CGPoint(x: centerX + cos(angle) * width / 2, y: centerY + sin(angle) * width * opening / 2)
        }
    }

    private static func face(points: Int = 76, eyeOpening: CGFloat = 0.35, leftEyeOpening: CGFloat? = nil,
                             mouthOpening: CGFloat = 0.05, yaw: Double? = 0, roll: Double? = 0) -> LensFaceFrame {
        LensFaceFrame(
            boundingBox: CGRect(x: 0.3, y: 0.3, width: 0.4, height: 0.4),
            points: Array(repeating: CGPoint(x: 0.5, y: 0.5), count: points),
            leftEye: region(centerX: 0.3, centerY: 0.65, width: 0.2, opening: leftEyeOpening ?? eyeOpening),
            rightEye: region(centerX: 0.7, centerY: 0.65, width: 0.2, opening: eyeOpening),
            innerLips: region(centerX: 0.5, centerY: 0.25, width: 0.3, opening: mouthOpening),
            yaw: yaw, roll: roll, pitch: 0
        )
    }
}
