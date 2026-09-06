import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Une publication à plusieurs slides part avec TOUTES ses scènes**
/// (directive porteur 2026-09-06).
///
/// ## Le défaut mesuré
///
/// Le socle posait `viewModel.currentSlide.effects` — la slide COURANTE, et
/// elle seule. Composer trois slides, en publier une.
///
/// Ce qui rend ce défaut particulier, c'est qu'il ne s'est vu nulle part : la
/// mosaïque, le carrousel, le défilement vertical et la tuile qui ouvre sa
/// scène ont été livrés, testés et jugés corrects AU-DESSUS d'un transport qui
/// ne portait qu'une scène. Quatre surfaces sans rien à peindre.
///
/// > **Une vue sans consommateur n'a aucun site où rougir.** Le témoin qui
/// > l'attrape n'interroge aucune vue : il demande ce que la PUBLICATION
/// > emporte.
final class ComposerPublishedSlideTests: XCTestCase {

    private func slide(_ texte: String) -> StorySlide {
        var s = StorySlide()
        s.effects.textObjects = [StoryTextObject(id: "t-\(texte)", text: texte, x: 0.5, y: 0.5)]
        return s
    }

    /// **LE témoin du lot.** Trois slides composées, trois scènes emportées.
    func test_troisSlides_emportentTroisScenes() throws {
        let porte = try XCTUnwrap(ComposerStoryCanvas.publishedSlide(
            format: .post, sceneIsPresent: true,
            slides: [slide("un"), slide("deux"), slide("trois")]))
        XCTAssertEqual(porte.canvasV3?.scenes.count, 3,
                       "sans cela, la mosaïque et le carrousel n'ont RIEN à peindre")
    }

    /// **La scène 1 est la PREMIÈRE slide, jamais celle qu'on regardait.**
    /// Sinon l'ordre de lecture de la publication dépendrait du hasard du
    /// geste — la slide affichée au moment d'appuyer sur publier.
    func test_laPremiereScene_estLaPremiereSlide() throws {
        let porte = try XCTUnwrap(ComposerStoryCanvas.publishedSlide(
            format: .post, sceneIsPresent: true,
            slides: [slide("un"), slide("deux")]))
        XCTAssertEqual(porte.textObjects.first?.text, "un")
        guard case .string(let premier)? = porte.canvasV3?.scenes.first?
            .objects.first(where: { $0.kind == .text })?.payload["text"] else {
            return XCTFail("la première scène doit porter le texte de la première slide")
        }
        XCTAssertEqual(premier, "un")
    }

    /// **Une seule slide se comporte EXACTEMENT comme avant ce lot** : aucun
    /// document mémorisé, donc aucune scène fantôme, et tout le corpus existant
    /// continue de s'encoder à l'identique.
    func test_uneSeuleSlide_neMemoriseAucunDocument() throws {
        let porte = try XCTUnwrap(ComposerStoryCanvas.publishedSlide(
            format: .post, sceneIsPresent: true, slides: [slide("seule")]))
        XCTAssertNil(porte.canvasV3)
    }

    /// **Sans scène à l'écran, rien ne part.** Un canvas vide encodé ferait
    /// croire à une scène composée puis effacée — c'est la raison d'origine de
    /// `sceneIsPresent`, et ce lot ne la lève pas.
    func test_sansSceneALEcran_rienNePart() {
        XCTAssertNil(ComposerStoryCanvas.publishedSlide(
            format: .post, sceneIsPresent: false, slides: [slide("un"), slide("deux")]))
        XCTAssertNil(ComposerStoryCanvas.publishedSlide(
            format: .post, sceneIsPresent: true, slides: []))
    }

    /// **Une STORY n'emporte pas ses autres slides par cette voie** : chacune
    /// de ses slides est une publication à part entière, publiée par l'atelier
    /// (`publishAllSlides`). Lui empiler ses sœurs dans un seul canvas
    /// publierait la même matière deux fois.
    ///
    /// La distinction se lit au CANAL, jamais à une liste de formats — un
    /// format neuf ne peut pas s'y glisser sans qu'on ait décidé de son cas.
    func test_uneStory_neMemorisePasSesAutresSlides() throws {
        let porte = try XCTUnwrap(ComposerStoryCanvas.publishedSlide(
            format: .story, sceneIsPresent: true,
            slides: [slide("un"), slide("deux")]))
        XCTAssertNil(porte.canvasV3)
        XCTAssertNotEqual(ComposerPublishChannel.channel(for: .story), .document,
                          "si la story rejoint le canal document, ce témoin tombe — " +
                          "et c'est le bon moment pour relire cette règle")
    }
}
