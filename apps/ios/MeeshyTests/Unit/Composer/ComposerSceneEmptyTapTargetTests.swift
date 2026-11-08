import XCTest
import MeeshySDK
@testable import Meeshy

/// **Écrire le texte du post ou la légende n'ouvre jamais la caméra** (#15674).
///
/// L'option « Texte du post » de la colonne lève le clavier sur le texte du
/// post (#13864), et le bouton du document y ramène en modification. La scène vide
/// restait pourtant une porte de la caméra : son indication se lisait sous le
/// champ, et le toucher qui voulait quitter l'écriture — ou que le clavier,
/// en bougeant, faisait tomber sur la scène à la place d'un contrôle — armait
/// le viseur. Sur simulateur, la session de capture bloque alors le fil
/// principal neuf secondes, et la publication attend qu'on referme la caméra.
final class ComposerSceneEmptyTapTargetTests: XCTestCase {

    func test_offers_whileWritingText_withholdsTheQuickCapture() {
        XCTAssertFalse(ComposerSceneQuickCapture.offers(sceneIsBlank: true, format: .post, stage: .off,
                                                        toolIsOpen: false, mediaIsEntering: false,
                                                        writesText: true))
        XCTAssertFalse(ComposerSceneQuickCapture.offers(sceneIsBlank: true, format: .story, stage: .off,
                                                        toolIsOpen: false, mediaIsEntering: false,
                                                        writesText: true))
    }

    func test_offers_withoutWriting_stillOffersTheQuickCapture() {
        XCTAssertTrue(ComposerSceneQuickCapture.offers(sceneIsBlank: true, format: .post, stage: .off,
                                                       toolIsOpen: false, mediaIsEntering: false,
                                                       writesText: false))
    }

    func test_outcome_whileWritingText_endsTheWritingInsteadOfArming() {
        XCTAssertEqual(ComposerSceneEmptyTap.outcome(hadSelection: false, effectIsOpen: false,
                                                     quickCaptureOffered: true, backgroundMediaId: nil,
                                                     writesText: true),
                       .endWriting)
        XCTAssertEqual(ComposerSceneEmptyTap.outcome(hadSelection: true, effectIsOpen: true,
                                                     quickCaptureOffered: false, backgroundMediaId: "fond",
                                                     bandIsOpen: true, writesText: true),
                       .endWriting,
                       "un seul geste, un seul effet : le toucher rend d'abord la scène")
    }

    func test_outcome_withoutWriting_keepsArmingTheViewfinder() {
        XCTAssertEqual(ComposerSceneEmptyTap.outcome(hadSelection: false, effectIsOpen: false,
                                                     quickCaptureOffered: true, backgroundMediaId: nil,
                                                     writesText: false),
                       .armViewfinder)
    }

    func test_host_feedsTheWritingStateToEveryCameraGesture() throws {
        let viseur = try Self.compactSource("MeeshyComposerHost+Viewfinder.swift")
        XCTAssertEqual(viseur.components(separatedBy: "writesText:writesText").count - 1, 2,
                       "le toucher et son indication lisent l'écriture en cours")
        XCTAssertTrue(viseur.contains("guard!writesText,sceneServesCapture,ComposerSceneCaptureGesture.offersCapture("),
                      "l'appui long n'ouvre pas la caméra pendant l'écriture")
        let etat = try Self.compactSource("MeeshyComposerHost+SceneState.swift")
        XCTAssertTrue(etat.contains("guardautosave.didBind,sceneQuickCaptureIsOffered"),
                      "l'indication grise lit l'offre du toucher, donc se tait pendant l'écriture")
        let hote = try Self.compactSource("MeeshyComposerHost.swift")
        XCTAssertTrue(hote.contains("writesText:writesText)"), "le toucher du fond sait qu'on écrit")
        XCTAssertTrue(hote.contains("ifissue==.endWriting{returnendSceneWriting()}"),
                      "le toucher rend la scène avant toute autre lecture")
    }

    private static func compactSource(_ file: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/\(file)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }
}
