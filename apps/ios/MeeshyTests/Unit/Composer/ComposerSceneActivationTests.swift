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

    // 1 — DÉCISION PURE : une couleur de fond fait naître la scène. STORY/RÉEL,
    // eux, montent la scène par le FORMAT (routage), plus par ce prédicat (B3).
    func test_uneCouleurDeFond_monteLaScene() {
        XCTAssertTrue(
            ComposerSceneActivation.activatesScene(background: "1E90FF"),
            "Une couleur de fond fait d'un POST une toile — la scène 9:16 naît."
        )
        XCTAssertFalse(
            ComposerSceneActivation.activatesScene(background: nil),
            "Sans fond, la surface reste celle du routage : STORY/RÉEL montent la scène "
                + "par le FORMAT que l'éventail écrit, jamais par ce prédicat (B3, #3926)."
        )
    }

    // 2 — le MEUBLE consulte la décision pure (le fond) et laisse le ROUTAGE
    // monter la scène pour STORY/RÉEL — jamais un seuil recopié, jamais un
    // booléen de destination ad hoc.
    func test_leMeuble_monteLaScene_parLaDecisionPure() throws {
        let raw = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        XCTAssertTrue(raw.contains("private var mountedSurface"),
                      "mountedSurface introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains("ComposerSceneActivation.activatesScene(background:documentBackground)"),
            "`mountedSurface` consulte la décision PURE du fond — plus de destination, le routage tranche le reste."
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

    // 6 — E1 (#3886) : la naissance de la scène SÈME la langue déclarée (la
    // capsule) dans l'atelier, défaut de tout objet posé.
    func test_laNaissanceDeLaScene_semeLaLangueDeclaree() throws {
        let src = compact(try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"))
        XCTAssertTrue(
            src.contains("viewModel.declaredContentLanguage=documentLanguage"),
            "Quand la scène naît (fond OU STORY), l'atelier reçoit la langue DÉCLARÉE au composer "
                + "(`documentLanguage`) comme défaut de tout objet — jamais « fr » codé en dur."
        )
    }

    // 7 — B1 (#3924) : quand la scène naît (fond OU STORY), le TEXTE **et** le
    // MÉDIA déjà composés SUIVENT — loi 9, changer de mode ne jette rien.
    func test_laNaissanceDeLaScene_porteLeTexteEtLeMedia() throws {
        let src = compact(try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"))
        XCTAssertTrue(
            src.contains("viewModel.applyContentText(documentText)"),
            "Le texte du document SUIT dans la scène (`applyContentText`) — loi 9."
        )
        XCTAssertTrue(
            src.contains("viewModel.applyContentMedia(documentContentMedia)"),
            "Le média du document SUIT dans la scène (`applyContentMedia`) — loi 9. "
                + "Le porter est aussi ce qui LÈVE le blocage de l'éventail sous le document (B3)."
        )
    }

    // 8 — B1 : la liste portée à la scène ne contient que l'IMAGE et la VIDÉO
    // (un son ou un document joint n'a pas de place de fond sur un canvas), et
    // le classement passe par le SEUL classeur MIME du dépôt.
    func test_leMediaPorte_neContientQueImageEtVideo() throws {
        let raw = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        XCTAssertTrue(raw.contains("private var documentContentMedia"),
                      "documentContentMedia introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains("ComposerIngestRouter.route(mime:media.mimeType)"),
            "Le classement image/vidéo passe par `ComposerIngestRouter.route(mime:)` — le SEUL classeur MIME "
                + "du dépôt, jamais un `hasPrefix` recopié."
        )
        XCTAssertTrue(
            src.contains("case.audio,.file:") && src.contains("returnnil"),
            "Le son et le document générique ne sont PAS portés (pas de place de fond sur un canvas)."
        )
    }

    // 9 — B2 (#3925) : la section description repliable est peinte SOUS le canvas,
    // en mode scène uniquement.
    func test_laSectionDescription_estPeinteSousLaScene() throws {
        let raw = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        XCTAssertTrue(raw.contains("private var sceneDescriptionSection"),
                      "sceneDescriptionSection introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains("ifmountedSurface==.scene{sceneDescriptionSection}"),
            "La section description ne se peint qu'en mode SCÈNE (Story/Réel), sous le canvas."
        )
    }

    // 10 — B2 : écrire la description garde UN seul contenu — elle met à jour
    // `documentText` (l'état partagé) ET le sème sur la scène (`applyContentText`),
    // jamais un second champ (loi 9 / B1).
    func test_laDescription_gardeUnSeulContenu() throws {
        let raw = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        XCTAssertTrue(raw.contains("private var sceneDescriptionBinding"),
                      "sceneDescriptionBinding introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains("documentText=newValue")
                && src.contains("viewModel.applyContentText(newValue)"),
            "La description écrit dans `documentText` (partagé) ET le sème sur la scène — "
                + "un seul contenu, jamais deux champs à faire diverger."
        )
    }

    // 11 — B2 : les libellés de la section sont traduits dans les 7 locales.
    func test_lesLibellesDescription_sontTraduits_7Locales() throws {
        let catalog = try source("Meeshy/Localizable.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(catalog.utf8)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]
        for key in ["composer.scene.description.placeholder",
                    "composer.scene.description.a11y.toggle"] {
            guard let entry = strings?[key] as? [String: Any],
                  let locs = entry["localizations"] as? [String: Any] else {
                return XCTFail("Clé « \(key) » absente du catalogue")
            }
            for loc in ["ar", "de", "en", "es", "fr", "it", "pt-BR"] {
                XCTAssertNotNil(locs[loc], "Section description « \(key) » : locale « \(loc) » manquante")
            }
        }
    }
}
