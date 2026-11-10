import XCTest
@testable import Meeshy

// Libellés d'accessibilité de la pilule d'appel, nommés comme la planche
// `docs/product/appels-vue-finale.md` (P1.13, P2.5, P2.6, #17417).

final class CallPillLabelsTests: XCTestCase {

    private static let langues = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

    private static let clesDuCatalogue = [
        "call.control.more.show",
        "call.control.more.hide",
        "call.control.camera.on",
        "call.control.camera.off",
        "call.control.output.a11y",
        "call.minimize",
        "call.header.pip",
    ]

    func test_moreLabel_whenExpanded_saysMasquerLesActions() {
        XCTAssertEqual(CallControlsCopy.moreLabel(isExpanded: true), "Masquer les actions")
    }

    func test_moreLabel_whenCollapsed_saysAfficherLesActions() {
        XCTAssertEqual(CallControlsCopy.moreLabel(isExpanded: false), "Afficher les actions")
    }

    func test_cameraLabel_whenEnabled_saysCouperLaCamera() {
        XCTAssertEqual(CallControlsCopy.cameraLabel(isEnabled: true), "Couper la caméra")
    }

    func test_cameraLabel_whenDisabled_saysActiverLaCamera() {
        XCTAssertEqual(CallControlsCopy.cameraLabel(isEnabled: false), "Activer la caméra")
    }

    func test_outputLabel_isSortieAudio() {
        XCTAssertEqual(CallControlsCopy.outputAudioLabel, "Sortie audio")
    }

    func test_catalogue_libellesDesCommandes_existentDansLesSeptLangues() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let url = racine.appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        let racineJSON = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let chaines = try XCTUnwrap(racineJSON["strings"] as? [String: [String: Any]])

        for cle in Self.clesDuCatalogue {
            let entree = try XCTUnwrap(chaines[cle], "clé absente du catalogue : \(cle)")
            let localisations = try XCTUnwrap(entree["localizations"] as? [String: Any], "aucune localisation : \(cle)")
            for langue in Self.langues {
                let loc = try XCTUnwrap(localisations[langue] as? [String: Any], "\(cle) sans \(langue)")
                let unite = try XCTUnwrap(loc["stringUnit"] as? [String: Any], "\(cle) sans stringUnit \(langue)")
                let valeur = try XCTUnwrap(unite["value"] as? String)
                XCTAssertFalse(valeur.isEmpty, "\(cle) vide en \(langue)")
            }
        }
    }

    func test_catalogue_reduire_estLeMotDeLaPlanche() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let url = racine.appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings")
        let racineJSON = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let chaines = try XCTUnwrap(racineJSON["strings"] as? [String: [String: Any]])
        let fr = try XCTUnwrap(chaines["call.minimize"]?["localizations"] as? [String: Any])
        let unite = try XCTUnwrap((fr["fr"] as? [String: Any])?["stringUnit"] as? [String: Any])
        XCTAssertEqual(unite["value"] as? String, "Réduire")
    }
}
