import XCTest
import AVFoundation
@testable import Meeshy

/// **L'objectif ralentit avant que le système ne le coupe** (#17469). Seule la température
/// de l'app (`thermalState`) était suivie ; la pression propre à la caméra (puissance de
/// crête, module de profondeur) montait sans réponse, jusqu'à l'interruption du système :
/// l'aperçu se figeait.
final class CameraSystemPressureLawTests: XCTestCase {

    func test_frameRate_nominalOrFair_keepsTheFormatRate() {
        XCTAssertNil(CameraSystemPressureLaw.frameRate(for: .nominal))
        XCTAssertNil(CameraSystemPressureLaw.frameRate(for: .fair))
    }

    func test_frameRate_serious_slowsTo24() {
        XCTAssertEqual(CameraSystemPressureLaw.frameRate(for: .serious), 24)
    }

    func test_frameRate_criticalOrShutdown_slowsTo15() {
        XCTAssertEqual(CameraSystemPressureLaw.frameRate(for: .critical), 15)
        XCTAssertEqual(CameraSystemPressureLaw.frameRate(for: .shutdown), 15)
    }

    func test_supportedRate_insideARange_isKept() {
        XCTAssertEqual(CameraSystemPressureLaw.supportedRate(24, in: [1...30]), 24)
    }

    func test_supportedRate_belowEveryRange_isRaisedToTheLowestSupported() {
        XCTAssertEqual(CameraSystemPressureLaw.supportedRate(15, in: [24...60]), 24)
    }

    func test_supportedRate_withoutRange_isNil() {
        XCTAssertNil(CameraSystemPressureLaw.supportedRate(24, in: []))
    }
}
