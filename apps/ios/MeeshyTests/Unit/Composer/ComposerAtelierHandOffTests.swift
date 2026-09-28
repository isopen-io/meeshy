import XCTest
import MeeshySDK
@testable import Meeshy

/// **#8520 — un post ou un réel de M scènes remis par l'atelier part en UNE
/// publication.**
///
/// L'atelier publie par `onPublishAllInBackground`, dont le canal crée un post
/// PAR SLIDE (`StoryViewModel.runStoryUpload`). C'est la sémantique d'une story
/// (N scènes ⇒ N stories) et la faute d'un post (M scènes ⇒ UN post, #4770).
/// Un post de trois scènes armé « Post » depuis la porte média partait en
/// trois posts.
///
/// La cardinalité est une RÈGLE nommée (critère 2 de #4770) : elle rend un
/// nombre d'envois, et c'est elle qui décide si la remise de l'atelier reste
/// sur son canal ou passe au canal DOCUMENT, le seul qui publie une fois.
final class ComposerAtelierHandOffTests: XCTestCase {

    // MARK: - Combien d'envois

    func test_publicationCount_story_unEnvoiParScene() {
        XCTAssertEqual(ComposerPublicationCardinality.publicationCount(for: .story, sceneCount: 3), 3)
    }

    func test_publicationCount_postEtReel_unSeulEnvoi() {
        XCTAssertEqual(ComposerPublicationCardinality.publicationCount(for: .post, sceneCount: 3), 1)
        XCTAssertEqual(ComposerPublicationCardinality.publicationCount(for: .reel, sceneCount: 3), 1)
    }

    func test_publicationCount_aucuneScene_unEnvoiQuandMeme() {
        XCTAssertEqual(ComposerPublicationCardinality.publicationCount(for: .story, sceneCount: 0), 1)
    }

    // MARK: - Par où part la remise de l'atelier

    func test_route_storyDeTroisScenes_resteSurLAtelier() {
        XCTAssertEqual(ComposerAtelierHandOff.route(targetType: .story, sceneCount: 3,
                                                    documentCarriesEveryMedia: true), .atelier)
    }

    func test_route_postDUneScene_resteSurLAtelier() {
        XCTAssertEqual(ComposerAtelierHandOff.route(targetType: .post, sceneCount: 1,
                                                    documentCarriesEveryMedia: false), .atelier)
    }

    func test_route_postDeTroisScenes_passeParLeDocument() {
        XCTAssertEqual(ComposerAtelierHandOff.route(targetType: .post, sceneCount: 3,
                                                    documentCarriesEveryMedia: true), .document)
    }

    func test_route_reelDeDeuxScenes_passeParLeDocument() {
        XCTAssertEqual(ComposerAtelierHandOff.route(targetType: .reel, sceneCount: 2,
                                                    documentCarriesEveryMedia: true), .document)
    }

    /// Le document ne téléverse que `localMedia` : une scène qui référence un
    /// fichier qu'il ne porte pas partirait amputée. Publier M posts serait le
    /// défaut qu'on corrige ; le refus DIT pourquoi.
    func test_route_postDeTroisScenes_mediaNonPorte_refuse() {
        XCTAssertEqual(ComposerAtelierHandOff.route(targetType: .post, sceneCount: 3,
                                                    documentCarriesEveryMedia: false), .refuse)
    }

    func test_format_suitLeTypeRemis() {
        XCTAssertEqual(ComposerAtelierHandOff.format(for: .post), .post)
        XCTAssertEqual(ComposerAtelierHandOff.format(for: .reel), .reel)
        XCTAssertEqual(ComposerAtelierHandOff.format(for: .story), .story)
    }

    // MARK: - Le relais de l'atelier consulte la règle

    /// Le relais que le meuble donne à l'atelier est le SEUL point où passe
    /// toute remise de l'atelier (les portes lui fournissent leur fermeture).
    /// Il doit consulter l'aiguillage AVANT de rappeler la fermeture reçue.
    func test_relaisDeLAtelier_consulteLAiguillageAvantDeTransmettre() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: .whitespacesAndNewlines).joined()
        guard let relais = code.range(of: "onPublishAllInBackground:{"),
              let appel = code.range(of: "onPublishAllInBackground(", range: relais.upperBound..<code.endIndex),
              let garde = code.range(of: "atelierHandOffStaysOnAtelier(", range: relais.upperBound..<code.endIndex)
        else {
            return XCTFail("Le relais de l'atelier ne consulte pas `atelierHandOffStaysOnAtelier` : "
                           + "un post de M scènes repartirait en M posts.")
        }
        XCTAssertLessThan(garde.lowerBound, appel.lowerBound,
                          "L'aiguillage doit précéder la transmission, sinon il ne décide de rien.")
    }
}
