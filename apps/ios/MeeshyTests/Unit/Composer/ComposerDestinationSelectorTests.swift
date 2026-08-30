import XCTest
import MeeshySDK
@testable import Meeshy

/// **B3 (#3926) — le sélecteur de destination contextuel est REPLIÉ dans
/// l'éventail : un seul sélecteur de mode.**
///
/// F1 (#3884) avait posé, sur la surface document, un sélecteur à trois segments
/// POST · RÉEL · STORY (`ComposerDocumentDestination` + `documentDestinationSelector`)
/// — un stopgap tant que le contenu ne pouvait pas suivre la bascule vers la
/// scène. B1/B2 ayant levé ce blocage (le texte, le média et la description
/// suivent document↔scène), B3 fond ce choix dans l'ÉVENTAIL existant
/// (`ComposerFormatFan`) : l'éventail offre RÉEL/STORY quand le média du document
/// qualifie, RÉEL rejoint STORY sur la SCÈNE (le média prend le canvas, directive
/// produit), et le sélecteur contextuel DISPARAÎT.
///
/// Ces gardes verrouillent la SUPERSESSION : l'ancien apparat retiré, le nouveau
/// comportement en place. Elles remplacent les huit gardes de F1, dont l'objet
/// (un second sélecteur de format) n'existe plus.
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

    // 1 — RÉEL et STORY montent la SCÈNE par le routage (le média prend le
    // canvas) : c'est la loi qui rend l'éventail suffisant pour les trois modes.
    func test_reelEtStory_montentLaScene_postResteDocument() {
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: .keyboardOnContent, format: .story), .scene,
            "STORY monte la scène 9:16."
        )
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: .keyboardOnContent, format: .reel), .scene,
            "RÉEL rejoint STORY sur la scène — le média prend le canvas (directive produit, B3)."
        )
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: .keyboardOnContent, format: .post), .document,
            "POST reste la surface document plate — ses médias forment un carrousel, jamais un canvas."
        )
    }

    // 2 — l'ÉVENTAIL est le seul sélecteur : l'enum et le sélecteur de F1 ont
    // disparu du composer (code mort retiré, pas juste caché).
    func test_leSelecteurDeDestination_aDisparu_duComposer() throws {
        let host = compact(try AppSourceGuard.composerHostSource())
        XCTAssertFalse(
            host.contains("documentDestinationSelector"),
            "Le sélecteur de destination contextuel est retiré du meuble (B3)."
        )
        XCTAssertFalse(
            host.contains("ComposerDocumentDestination"),
            "L'enum de destination n'est plus référencé — l'éventail (`ComposerFormat`) est la seule source du mode."
        )
        let surface = compact(try AppSourceGuard.composerSurfaceSource())
        XCTAssertFalse(
            surface.contains("enumComposerDocumentDestination"),
            "L'enum `ComposerDocumentDestination` est SUPPRIMÉ, jamais laissé en jumelle divergente."
        )
    }

    // 3 — l'éventail RESPIRE avec le média du document : `reelGate` lit
    // `documentComposesReel`, l'offre RÉEL apparaît à temps pour servir à basculer.
    func test_lEventail_respireAvecLeMediaDuDocument() throws {
        let host = try AppSourceGuard.composerHostSource()
        XCTAssertTrue(host.contains("var reelGate"), "reelGate introuvable ou source vide")
        let src = compact(host)
        XCTAssertTrue(
            src.contains("varreelGate:Bool") && src.contains("documentComposesReel"),
            "Le gate du réel de l'éventail lit `documentComposesReel` — l'offre respire sur la composition du document."
        )
    }

    // 4 — le report du contenu vers la scène a UN seul site (l'`onChange` sur
    // `mountedSurface`), plus une closure par bouton : quel que soit le contrôle
    // qui bascule, le texte et le média suivent (loi 9, B1).
    func test_leReportDuContenu_aUnSeulSite_surMountedSurface() throws {
        let src = compact(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(
            src.contains("funccarryContentIntoSceneIfNeeded()"),
            "Le report vit dans UNE fonction nommée, testable et unique."
        )
        XCTAssertTrue(
            src.contains(".adaptiveOnChange(of:mountedSurface,initial:true)"),
            "Le report se branche sur `mountedSurface` : il se déclenche quand la scène naît, quel que soit le contrôle."
        )
        XCTAssertTrue(
            src.contains("carryContentIntoSceneIfNeeded()"),
            "…et le body appelle bien ce report."
        )
    }

    // 5 — la publication du document est TOUJOURS un POST simple : RÉEL/STORY
    // partent par la scène, jamais un réel promu en silence depuis le document.
    func test_laPublicationDuDocument_estToujoursUnPostSimple() throws {
        let src = compact(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(
            src.contains("forcePlainPost:true"),
            "Le document publie un POST simple (carrousel possible), jamais un réel — RÉEL passe par la scène (B3)."
        )
        XCTAssertFalse(
            src.contains("forcePlainPost:documentDestination.forcePlainPost"),
            "Plus de forçage issu d'une destination stockée — l'ancien canal a disparu."
        )
    }
}
