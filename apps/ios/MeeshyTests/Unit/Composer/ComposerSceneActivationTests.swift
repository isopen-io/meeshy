import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **F2 (#3885) — choisir une couleur de fond fait NAÎTRE la scène 9:16.**
///
/// « Un post sans visuel devient une toile. » La surface document était plate
/// (texte + bande média) ; poser une couleur de fond — ou choisir la
/// destination STORY (F1) — bascule `mountedSurface` vers `.scene`, montant
/// l'atelier 9:16 existant (`StoryComposerView`) avec la couleur semée. La
/// décision est une fonction PURE, testable off-main ; la scène et son picker
/// de fond existent déjà côté SDK — F2 les CÂBLE, ne les reconstruit pas.
final class ComposerSceneActivationTests: XCTestCase {

    private static let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func compact(_ text: String) -> String {
        AppSourceGuard.stripComments(text)
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // 1 — DÉCISION PURE : une couleur de fond OU la destination STORY monte la
    // scène ; un post plat sans fond reste plat.
    func test_uneCouleurDeFond_ouStory_monteLaScene() {
        XCTAssertTrue(
            ComposerSceneActivation.activatesScene(background: "1E90FF", destination: .post),
            "Une couleur de fond fait d'un POST une toile — la scène 9:16 naît."
        )
        XCTAssertTrue(
            ComposerSceneActivation.activatesScene(background: nil, destination: .story),
            "La destination STORY monte la scène (F1, mountsScene), même sans fond choisi."
        )
        XCTAssertFalse(
            ComposerSceneActivation.activatesScene(background: nil, destination: .post),
            "Sans fond ni STORY, la surface reste plate — pas de scène imposée."
        )
        XCTAssertFalse(
            ComposerSceneActivation.activatesScene(background: nil, destination: .reel),
            "Un RÉEL sans fond reste sur la surface document — la scène ne naît que par le fond ou STORY."
        )
    }

    // 2 — le MEUBLE consulte la décision pure et monte `.scene` — jamais un
    // seuil recopié, jamais un booléen ad hoc.
    func test_leMeuble_monteLaScene_parLaDecisionPure() throws {
        let raw = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        XCTAssertTrue(raw.contains("private var mountedSurface"),
                      "mountedSurface introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains("ComposerSceneActivation.activatesScene(background:documentBackground,destination:documentDestination)"),
            "`mountedSurface` consulte la décision PURE — le fond et la destination, pas une condition recopiée."
        )
        XCTAssertTrue(
            src.contains("vardocumentBackground:String?"),
            "La couleur de fond choisie vit dans le SOCLE (`documentBackground`), `nil` = surface plate."
        )
    }

    // 3 — la surface document PEINT un picker de couleur de fond, sur la palette
    // partagée du SDK (aucune palette recopiée).
    func test_laSurface_peintLePickerDeFond_surLaPalettePartagee() throws {
        let raw = try source("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
        XCTAssertTrue(raw.contains("private var backgroundStrip"),
                      "backgroundStrip introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains("StoryBackgroundPalette.colors"),
            "Le picker itère la palette PARTAGÉE (`StoryBackgroundPalette.colors`), jamais une liste recopiée."
        )
        XCTAssertTrue(
            src.contains("onPickBackground?("),
            "Choisir une couleur REMONTE au meuble (`onPickBackground`) — la surface reste sans état."
        )
    }

    // 4 — le meuble CÂBLE le picker : il pose la couleur dans le SOCLE ET la sème
    // dans l'atelier (le fond que la scène affiche).
    func test_leMeuble_cableLePicker_etSemeLaCouleur() throws {
        let src = compact(try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"))
        XCTAssertTrue(
            src.contains("onPickBackground:"),
            "Le meuble passe `onPickBackground` à la surface — le geste remonte au socle."
        )
        XCTAssertTrue(
            src.contains("documentBackground=hex"),
            "Choisir une couleur pose le fond du socle — ce qui monte la scène (décision pure)."
        )
        XCTAssertTrue(
            src.contains("viewModel.applyBackground(hex:hex)"),
            "…et sème la couleur dans l'atelier via le point d'entrée public, pour que la scène montée l'affiche."
        )
    }

    // 5 — le libellé du picker est traduit dans les 7 locales (cliquet i18n).
    func test_leLibelleDuPicker_estTraduit_7Locales() throws {
        let catalog = try source("Meeshy/Localizable.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(catalog.utf8)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]
        guard let entry = strings?["composer.document.a11y.background"] as? [String: Any],
              let locs = entry["localizations"] as? [String: Any] else {
            return XCTFail("Clé « composer.document.a11y.background » absente du catalogue")
        }
        for loc in ["ar", "de", "en", "es", "fr", "it", "pt-BR"] {
            XCTAssertNotNil(locs[loc], "Picker de fond : locale « \(loc) » manquante (cliquet i18n)")
        }
    }
}
