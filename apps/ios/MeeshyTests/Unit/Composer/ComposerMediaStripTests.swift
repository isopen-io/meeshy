import XCTest
import MeeshySDK
@testable import Meeshy

/// **B (#3883) — on VOIT le média choisi, et le type POST↔RÉEL suit le média.**
///
/// Sélectionner une photo ne montrait RIEN : `documentLocalMedia` alimentait le
/// prédicat de format et partait à la publication, mais n'était jamais peint. Ce
/// lot le rend visible — un ruban de vignettes RETIRABLES (`mediaStrip`) — et
/// vérifie que le toggle POST↔RÉEL réagit à la composition (loi 4, déjà câblé au
/// T2.4). Le choix STORY dépend de la scène → LOT 2 (milestone F).
final class ComposerMediaStripTests: XCTestCase {

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

    // 1 — le type SUIT le média (le prédicat du toggle POST↔RÉEL), par comportement.
    func test_leType_suitLeMedia() {
        XCTAssertFalse(
            ReelComposition.qualifiesAsReel(mimeTypes: ["image/jpeg"]),
            "Une seule image reste un POST — l'interrupteur POST↔RÉEL ne doit pas apparaître."
        )
        XCTAssertTrue(
            ReelComposition.qualifiesAsReel(mimeTypes: ["image/jpeg", "image/png"]),
            "Deux images qualifient RÉEL — l'interrupteur apparaît (loi 4)."
        )
        XCTAssertTrue(
            ReelComposition.qualifiesAsReel(mimeTypes: ["video/quicktime"], durationsMs: [5000]),
            "Une vidéo ≥ 3 s qualifie RÉEL."
        )
        XCTAssertFalse(
            ReelComposition.qualifiesAsReel(mimeTypes: ["video/quicktime"], durationsMs: [1000]),
            "Une vidéo trop courte reste un POST."
        )
    }

    // 2 — la surface PEINT le média reçu, en vignettes retirables.
    func test_laSurface_peintLeMedia_enVignettesRetirables() throws {
        // Le ruban a été MONTÉ en barre haute au 2026-08-27 (#4047) et s'appelle
        // désormais `slideRail` — en Post une slide EST un média, le rail des
        // slides et l'inventaire des pièces jointes sont le MÊME objet. Ce que
        // cette garde protège n'a pas changé d'un mot : le média choisi est
        // VISIBLE et RETIRABLE. Seul son logement a bougé — DEUX fois.
        //
        // **RE-POINTÉE au #4064.** #4070 a sorti la barre haute de la surface
        // document pour en faire `ComposerTopBar`, partagée avec la surface de
        // scène ; cette garde lisait toujours `ComposerDocumentSurface.swift` et
        // rougissait donc sur un fichier où le ruban n'était plus. Une garde de
        // source ne suit pas le code qu'elle protège : c'est à la main qu'on la
        // déplace, et un gate CIBLÉ ne l'exécute pas pour le dire.
        let raw = try source("Meeshy/Features/Main/Composer/ComposerTopBar.swift")
        XCTAssertTrue(raw.contains("private var slideRail"), "slideRail introuvable ou source vide")
        XCTAssertFalse(raw.contains("private var mediaStrip"),
            "Le ruban vit en DEUX exemplaires — l'ancien en bas, le rail en haut : deux inventaires du "
                + "même média, à faire diverger au premier chemin d'ingestion qui n'alimente que l'un.")
        XCTAssertFalse(
            try AppSourceGuard.composerSurfaceSource()
                .contains("private var mediaStrip"),
            "L'ancien ruban est revenu dans le document : c'est le second inventaire que #4047 interdit."
        )
        let src = compact(raw)
        // `let`, et pas `var` : la barre RECEIT l'inventaire et ne peut pas
        // l'amender — une forme plus forte que celle que gardait la version
        // d'avant, où la surface document le déclarait en `var`.
        XCTAssertTrue(
            src.contains("letlocalMedia:[ComposerDocumentMedia]"),
            "La barre doit RECEVOIR `localMedia` — elle reste sans état, le meuble le possède."
        )
        XCTAssertTrue(
            src.contains("ForEach(localMedia,id:\\.url)") && src.contains("ComposerMediaThumbnail("),
            "Le ruban doit peindre UNE vignette par média (`ComposerMediaThumbnail`) — la preuve visible."
        )
        XCTAssertTrue(
            src.contains("onRemoveMedia?("),
            "Chaque vignette doit pouvoir se RETIRER via `onRemoveMedia` — retirer re-juge le format."
        )
    }

    // 3 — le meuble CÂBLE son média à la surface, et le retrait ôte du modèle.
    func test_leMeuble_cableSonMediaEtLeRetrait() throws {
        let src = compact(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(src.contains("structMeeshyComposerHost"), "MeeshyComposerHost introuvable ou vide")
        XCTAssertTrue(
            src.contains("localMedia:documentLocalMedia"),
            "Le meuble doit passer `localMedia: documentLocalMedia` à la surface — sans quoi rien n'est peint."
        )
        XCTAssertTrue(
            src.contains("documentLocalMedia.removeAll"),
            "Le retrait d'une vignette doit ôter l'élément de `documentLocalMedia` — ce qui RE-JUGE le format."
        )
    }

    // 4 — le choix de mode RESPIRE avec la composition, via l'ÉVENTAIL (B3,
    // #3926) : le gate du réel lit `documentComposesReel`, si bien que l'éventail
    // offre RÉEL dès que le média du document qualifie — plus de sélecteur de
    // destination séparé (loi 4 : un seul contrôle, jamais deux).
    func test_leType_respireAvecLaComposition_viaLEventail() throws {
        let src = compact(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(
            src.contains("varreelGate:Bool") && src.contains("documentComposesReel"),
            "Le gate du réel de l'éventail respire sur la composition du DOCUMENT (`documentComposesReel`), "
                + "pas seulement sur l'atelier — l'offre RÉEL apparaît à temps pour servir à basculer."
        )
        XCTAssertFalse(
            src.contains("documentDestinationSelector"),
            "Le sélecteur de destination contextuel est RETIRÉ (B3) : l'éventail est le seul sélecteur de mode."
        )
    }

    // 5 — le libellé du ruban est traduit dans les 7 locales (cliquet i18n).
    func test_leLibelleDuRuban_estTraduit_7Locales() throws {
        let catalog = try source("Meeshy/Localizable.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(catalog.utf8)) as? [String: Any]
        let strings = json?["strings"] as? [String: Any]
        guard let entry = strings?["composer.document.a11y.media"] as? [String: Any],
              let locs = entry["localizations"] as? [String: Any] else {
            return XCTFail("Clé « composer.document.a11y.media » absente du catalogue")
        }
        for loc in ["ar", "de", "en", "es", "fr", "it", "pt-BR"] {
            XCTAssertNotNil(locs[loc], "Clé du ruban : locale « \(loc) » manquante (cliquet i18n)")
        }
    }

    // MARK: - #4052 — un chip qu'aucune slide ne sélectionne garde sa croix

    /// **Le correctif de pixel du #4047 était TOTAL tant que tout média était
    /// une slide.** Le #4052 a rompu l'équivalence : un audio devient la
    /// bande-son de la scène, pas une page du carrousel — il n'a donc aucune
    /// slide à sélectionner, son chip ne porte jamais l'anneau, et son ✕ ne
    /// s'affichait PLUS JAMAIS. Le vocal devenait irretirable.
    func test_unChipSansSlide_gardeSaCroix_sinonSonMediaSeraitIrretirable() {
        XCTAssertTrue(
            ComposerMediaChipAffordance.showsRemove(isSelected: false, isSelectable: false),
            "Un chip qu'aucune slide ne peut sélectionner n'a QUE sa croix : la lui retirer laisse un "
                + "média posé pour toujours."
        )
    }

    /// L'ordre « deux gestes pour supprimer » reste tenu partout où un PREMIER
    /// geste existe — c'est-à-dire sur les chips qui mènent à une slide.
    func test_unChipSelectionnable_neMontreSaCroix_queSelectionne() {
        XCTAssertFalse(
            ComposerMediaChipAffordance.showsRemove(isSelected: false, isSelectable: true),
            "Viser une vignette pour NAVIGUER ne doit pas la supprimer — le défaut mesuré au #4047."
        )
        XCTAssertTrue(
            ComposerMediaChipAffordance.showsRemove(isSelected: true, isSelectable: true)
        )
    }

    /// Le cas dégénéré, écrit pour qu'il ne surprenne personne : un chip
    /// sélectionné garde sa croix même si la carte le dit non sélectionnable.
    func test_unChipSelectionne_gardeSaCroix_quoiQuenDiseLaCarte() {
        XCTAssertTrue(
            ComposerMediaChipAffordance.showsRemove(isSelected: true, isSelectable: false)
        )
    }
}
