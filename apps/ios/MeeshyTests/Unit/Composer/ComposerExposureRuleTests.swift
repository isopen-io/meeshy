import XCTest
@testable import Meeshy

/// **La luminosité en curseur vertical** (#9351, décision porteur 2026-10-05) :
/// ±2 EV, vers le haut éclaire, par tiers d'EV à la voix, neutre au
/// retournement et à la réouverture.
@MainActor
final class ComposerExposureRuleTests: XCTestCase {

    func test_clamped_outsideTwoEV_isBoundedAtTwoEV() {
        XCTAssertEqual(ComposerExposureRule.clamped(5), 2)
        XCTAssertEqual(ComposerExposureRule.clamped(-3.5), -2)
        XCTAssertEqual(ComposerExposureRule.clamped(0.7), 0.7, accuracy: 0.0001)
        XCTAssertEqual(ComposerExposureRule.clamped(.nan), 0, "une valeur absurde rend la neutre")
    }

    func test_biasAtY_top_brightens_bottom_darkens() {
        XCTAssertEqual(ComposerExposureRule.bias(atY: 0, height: 120), 2, accuracy: 0.0001, "en haut, +2 EV")
        XCTAssertEqual(ComposerExposureRule.bias(atY: 120, height: 120), -2, accuracy: 0.0001, "en bas, −2 EV")
        XCTAssertEqual(ComposerExposureRule.bias(atY: 60, height: 120), 0, accuracy: 0.0001, "au milieu, neutre")
        XCTAssertEqual(ComposerExposureRule.bias(atY: -40, height: 120), 2, accuracy: 0.0001, "hors piste, borné")
        XCTAssertEqual(ComposerExposureRule.bias(atY: 30, height: 0), 0, "une piste sans hauteur ne règle rien")
    }

    func test_thumbPosition_isTheInverseOfTheTrack() {
        XCTAssertEqual(ComposerExposureRule.thumbPosition(2), 0, accuracy: 0.0001)
        XCTAssertEqual(ComposerExposureRule.thumbPosition(0), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerExposureRule.thumbPosition(-2), 1, accuracy: 0.0001)
    }

    func test_stepped_movesByAThirdOfAnEV_onTheGrid_andStaysBounded() {
        XCTAssertEqual(ComposerExposureRule.stepped(0, up: true), 1.0 / 3.0, accuracy: 0.0001)
        XCTAssertEqual(ComposerExposureRule.stepped(0, up: false), -1.0 / 3.0, accuracy: 0.0001)
        XCTAssertEqual(ComposerExposureRule.stepped(0.5, up: true), 1, accuracy: 0.0001,
                       "un réglage au doigt rejoint la grille des tiers")
        XCTAssertEqual(ComposerExposureRule.stepped(2, up: true), 2, accuracy: 0.0001)
        XCTAssertEqual(ComposerExposureRule.stepped(-2, up: false), -2, accuracy: 0.0001)
    }

    func test_shows_onlyWhileArmed_neverInEditing() {
        XCTAssertTrue(ComposerExposureRule.shows(stage: .armed, editing: false))
        XCTAssertFalse(ComposerExposureRule.shows(stage: .recording, editing: false), "caché pendant la prise")
        XCTAssertFalse(ComposerExposureRule.shows(stage: .off, editing: false))
        XCTAssertFalse(ComposerExposureRule.shows(stage: .armed, editing: true), "l'édition n'a plus de caméra")
    }

    // MARK: - La machine pose la luminosité sur l'objectif

    func test_setExposureBias_clampsAndReachesTheLens() {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, controls: objectif)
        session.setExposureBias(3)
        XCTAssertEqual(session.exposureBias, 2)
        XCTAssertEqual(objectif.exposureBiases.last, 2)
    }

    func test_setExposureBias_unchanged_doesNotRelockTheLens() {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, controls: objectif)
        session.setExposureBias(1)
        session.setExposureBias(1)
        XCTAssertEqual(objectif.exposureBiases, [1])
    }

    func test_stepExposure_movesByAThird() {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, controls: objectif)
        session.stepExposure(up: true)
        XCTAssertEqual(session.exposureBias, 1.0 / 3.0, accuracy: 0.0001)
    }

    func test_flipCamera_bringsTheSliderBackToNeutral() {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, controls: objectif)
        session.setExposureBias(1.5)
        session.flipCamera()
        objectif.finishSwitch()
        XCTAssertEqual(session.exposureBias, 0, "le curseur revient au neutre avec l'objectif")
        XCTAssertEqual(objectif.exposureBiases.last, 0)
    }

    func test_resetExposure_atReopening_isNeutral() {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .armed, controls: objectif)
        session.setExposureBias(-1)
        session.resetExposure()
        XCTAssertEqual(session.exposureBias, 0)
        XCTAssertEqual(objectif.exposureBiases.last, 0)
    }

    func test_catalogue_exposureAndDiscardKeys_inSevenLanguages() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let racine = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let cles = try XCTUnwrap(racine["strings"] as? [String: Any])
        for cle in ["composer.camera.exposure", "composer.camera.discard.title",
                    "composer.camera.discard.confirm", "composer.camera.discard.keep"] {
            let entree = try XCTUnwrap(cles[cle] as? [String: Any], "clé absente : \(cle)")
            let langues = try XCTUnwrap(entree["localizations"] as? [String: Any])
            XCTAssertEqual(Set(langues.keys), ["fr", "en", "es", "de", "it", "pt-BR", "ar"], cle)
        }
    }
}
