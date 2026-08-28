import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **#3939 (retour porteur 2026-08-27) — choisir une couleur de fond ne fait
/// PLUS naître la scène 9:16 plein écran.**
///
/// L'ancienne règle F2 (#3885, `ComposerSceneActivation.activatesScene`,
/// SUPPRIMÉE) faisait basculer `mountedSurface` vers `.scene` dès qu'un fond
/// était choisi — un remplacement de route surprenant, jamais demandé :
/// l'auteur voulait rester sur l'écran document. Incrément SÛR de #3939 :
/// cette bascule est coupée ; l'incrustation du canvas DANS l'écran document
/// reste à livrer (sous-tâche explicite de #3939, budget dédié).
///
/// STORY/RÉEL, eux, continuent de monter la scène par le FORMAT (routage,
/// B3/#3926) — INCHANGÉ par ce correctif.
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

    // 1 — le prédicat F2 est SUPPRIMÉ : plus aucun site ne doit le citer, ni
    // dans le meuble ni ailleurs — sa réapparition serait la régression même
    // que ce lot corrige.
    func test_composerSceneActivation_neSuPlusReferencee() throws {
        // Commentaires STRIPPÉS avant l'assertion : le fichier explique le
        // retrait dans un doc-comment qui cite l'ANCIEN nom du type à des
        // fins historiques — une assertion sur `raw` non dépouillé se
        // contredirait elle-même (le commentaire qui EXPLIQUE la suppression
        // ferait rougir le test qui la VÉRIFIE). Seul du CODE qui réintroduit
        // le type doit faire rougir cette garde.
        let code = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        )
        XCTAssertFalse(
            code.contains("ComposerSceneActivation"),
            "`ComposerSceneActivation` ne doit plus être référencée — choisir un fond ne bascule plus "
                + "`mountedSurface` vers `.scene` (#3939)."
        )
    }

    // 2 — le MEUBLE monte la scène UNIQUEMENT par le routage du format
    // (STORY/RÉEL) — jamais par la couleur de fond choisie.
    func test_leMeuble_monteLaScene_parLeRoutageDuFormatSeul() throws {
        let raw = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        XCTAssertTrue(raw.contains("private var mountedSurface"),
                      "mountedSurface introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains("returnComposerSurfaceRouting.surface(opening:profile.opensWith,format:selectedFormat)"),
            "`mountedSurface` doit renvoyer directement le routage du format — plus de branche sur le fond."
        )
        XCTAssertTrue(
            src.contains("vardocumentBackground:String?"),
            "La couleur de fond choisie reste posée dans le SOCLE (`documentBackground`) — utile à "
                + "l'atelier une fois l'incrustation livrée (#3939), même sans effet de routage aujourd'hui."
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
    /// **Renommée au #4052 — la moitié « audio » de son verdict est TOMBÉE.**
    ///
    /// Elle exigeait `case .audio, .file: return nil`, sur le motif « un son n'a
    /// pas de place de fond sur un canvas ». C'était juste d'un fond VISUEL, et
    /// faux du son : le modèle (§ 4) lui donne un TROISIÈME emplacement, la
    /// bande-son de la scène. La garde disait donc, en croyant protéger,
    /// « n'implémente jamais le § 4 ».
    ///
    /// Ce qu'elle protégeait de VRAI est conservé et RENFORCÉ : le classement
    /// passe toujours par l'unique classeur MIME du dépôt, et le DOCUMENT reste
    /// hors scène — lui n'a de place ni visuelle ni sonore.
    func test_leMediaPorte_prendImageVideoEtSon_maisJamaisUnDocument() throws {
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
            src.contains("case.audio:") && src.contains("kind:.audio"),
            "Le SON doit être porté (#4052) — il devient la bande-son de la scène, le troisième "
                + "emplacement du modèle § 4."
        )
        XCTAssertTrue(
            src.contains("case.file:returnnil"),
            "Le DOCUMENT reste hors scène : il n'a de place ni visuelle ni sonore. C'est la moitié de "
                + "l'ancien verdict qui tient toujours."
        )
        XCTAssertFalse(
            src.contains("case.audio,.file:"),
            "Le son et le document ne se décident plus ENSEMBLE : les traiter d'un seul cas est ce qui "
                + "avait fait rejeter le son avec le document."
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
    //
    // **`composer.scene.description.a11y.toggle` en est SORTIE au #4065**, avec
    // le chevron qu'elle nommait : la barre repliable a cédé la place au calque
    // de lecture, et la clé n'avait plus aucun lecteur. Une clé gardée ici sans
    // lecteur aurait fait croire à sept traductions vivantes pour un contrôle
    // qui n'existe plus. Les trois clés du calque prennent sa place.
    func test_lesLibellesDescription_sontTraduits_7Locales() throws {
        let catalog = try source("Meeshy/Localizable.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(catalog.utf8)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]
        for key in ["composer.scene.description.placeholder",
                    "composer.description.amorce",
                    "composer.description.a11y.edit",
                    "composer.description.a11y.done"] {
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
