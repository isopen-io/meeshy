import XCTest
import MeeshySDK
@testable import Meeshy

/// **F1 (#3884) — dès qu'un média qualifie, on choisit d'un geste entre RÉEL et
/// STORY (et le POST reste offert).**
///
/// Jusqu'ici la surface document n'offrait qu'un interrupteur binaire POST↔RÉEL
/// (`documentForcePlainPost`) ; le 3e terme STORY manquait au sélecteur. Ce lot
/// remplace le booléen par une DESTINATION à trois états — un type SOMME pur,
/// testable off-main — qui gouverne le type publié : `.post`/`.reel` de bout en
/// bout via `forcePlainPost` (le serveur accepte), `.story` monte la scène
/// (F2). Zéro clé i18n neuve : `feed.composer.type.post`/`.reel` +
/// `content.type.story` existent déjà dans les 7 locales.
final class ComposerDestinationSelectorTests: XCTestCase {

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

    // 1 — GOUVERNANCE : chaque destination porte SON type publié, SON forçage et
    // dit si elle monte la scène. C'est la loi que « le type choisi gouverne la
    // publication » — pure, sans vue.
    func test_chaqueDestination_gouverneLeType() {
        XCTAssertEqual(ComposerDocumentDestination.post.postType, .post)
        XCTAssertEqual(ComposerDocumentDestination.reel.postType, .reel)
        XCTAssertEqual(ComposerDocumentDestination.story.postType, .story)

        XCTAssertTrue(ComposerDocumentDestination.post.forcePlainPost,
                      "Choisir POST retient un post simple malgré la qualification.")
        XCTAssertFalse(ComposerDocumentDestination.reel.forcePlainPost)
        XCTAssertFalse(ComposerDocumentDestination.story.forcePlainPost)

        XCTAssertTrue(ComposerDocumentDestination.story.mountsScene,
                      "STORY monte la scène 9:16 (F2) — POST/RÉEL restent sur la surface plate.")
        XCTAssertFalse(ComposerDocumentDestination.post.mountsScene)
        XCTAssertFalse(ComposerDocumentDestination.reel.mountsScene)
    }

    // 2 — les TROIS destinations, dans l'ordre POST · RÉEL · STORY.
    func test_lesTroisDestinations_dansLOrdre() {
        XCTAssertEqual(ComposerDocumentDestination.allCases, [.post, .reel, .story])
    }

    // 3 — le sélecteur APPARAÎT quand le média qualifie — sur un audio ≥ 3 s ET
    // sur 2 images (le prédicat exact du critère de fin).
    func test_leSelecteur_apparait_surAudio_etSur2Images() {
        XCTAssertTrue(
            ReelComposition.qualifiesAsReel(mimeTypes: ["audio/mp4"], durationsMs: [3000]),
            "Un audio ≥ 3 s qualifie — le sélecteur RÉEL/STORY apparaît."
        )
        XCTAssertTrue(
            ReelComposition.qualifiesAsReel(mimeTypes: ["image/jpeg", "image/png"]),
            "Deux images qualifient — le sélecteur apparaît."
        )
        XCTAssertFalse(
            ReelComposition.qualifiesAsReel(mimeTypes: ["image/jpeg"]),
            "Une seule image ne qualifie pas — pas de sélecteur (loi 4)."
        )
    }

    // 4 — le meuble PEINT le sélecteur, gaté sur la MÊME qualification que
    // l'interrupteur qu'il remplace (loi 4 : sans effet ⇒ absent).
    func test_leMeuble_peintLeSelecteur_gateSurLaQualification() throws {
        let raw = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        XCTAssertTrue(raw.contains("private var documentDestinationSelector"),
                      "documentDestinationSelector introuvable ou source vide")
        let src = compact(raw)
        XCTAssertTrue(
            src.contains("ifdocumentComposesReel{documentDestinationSelector}"),
            "Le sélecteur ne se peint que quand la composition QUALIFIE — le même gate que l'ancien "
                + "interrupteur POST↔RÉEL, jamais un seuil recopié."
        )
        XCTAssertTrue(
            src.contains("vardocumentDestination:ComposerDocumentDestination"),
            "La destination est le SOCLE — un état à trois valeurs, jamais un booléen POST↔RÉEL."
        )
    }

    // 5 — le sélecteur offre les TROIS destinations (itère `allCases`), non un
    // choix codé en dur qui oublierait STORY.
    func test_leSelecteur_offreLesTroisDestinations() throws {
        let src = compact(try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"))
        XCTAssertTrue(
            src.contains("ComposerDocumentDestination.allCases"),
            "Le sélecteur itère `ComposerDocumentDestination.allCases` — ajouter une destination demain "
                + "la peint sans toucher la vue."
        )
    }

    // 6 — la PUBLICATION transmet le forçage de la DESTINATION, jamais un
    // littéral ni un booléen fantôme.
    func test_laPublication_transmetLeForcageDeLaDestination() throws {
        let src = compact(try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"))
        XCTAssertTrue(
            src.contains("forcePlainPost:documentDestination.forcePlainPost"),
            "Le publieur lit `documentDestination.forcePlainPost` — le type choisi gouverne la publication."
        )
    }
}
