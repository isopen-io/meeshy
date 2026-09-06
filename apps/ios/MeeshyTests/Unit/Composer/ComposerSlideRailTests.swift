import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La rangée haute montre les SCÈNES, pas les médias** (constat porteur
/// 2026-09-06 : « lorsque je crée une nouvelle scène elle n'apparaît pas
/// immédiatement dans la mini-preview »).
///
/// ## La cause, écrite dans le doc-comment qu'elle contredisait
///
/// `ComposerTopBar` déclarait ses vignettes « une par `MeeshySlide`, ce qui veut
/// dire une par média posé en FOND ». Les deux moitiés de cette phrase ont été
/// vraies ensemble tant que toute slide naissait d'un média. Un fond COLORÉ les
/// sépare : la scène existe, elle n'a aucun média, et la rangée — filtrée par
/// `slideIdByMediaURL` — n'a rien à montrer.
///
/// > **Une équivalence écrite comme un fait devient un piège le jour où ses deux
/// > termes divergent.** Elle ne se relit pas : elle se lit comme une
/// > définition, et c'est ce qui la rend invisible.
///
/// Le défaut a été aggravé le même jour par le retrait de la bande de pastilles
/// (directive porteur) : elle comptait les slides, elle, et masquait donc ce
/// trou. **Retirer un doublon révèle ce que l'autre ne couvrait pas.**
final class ComposerSlideRailTests: XCTestCase {

    private func slideAvecMedia(_ id: String) -> StorySlide {
        var s = StorySlide(id: id)
        s.effects.mediaObjects = [StoryMediaObject(id: "m-\(id)", postMediaId: "p-\(id)",
                                                   aspectRatio: 1, isBackground: true)]
        return s
    }

    private func slideSansMedia(_ id: String, couleur: String = "FF2E63") -> StorySlide {
        var s = StorySlide(id: id)
        s.effects.background = couleur
        return s
    }

    /// **LE témoin du défaut.** Une scène à fond coloré n'a aucun média — et
    /// doit tout de même occuper sa place dans la rangée. Sans lui, l'auteur
    /// crée une scène et rien à l'écran ne le lui dit.
    func test_uneSceneSansMedia_aSaTuile() {
        let tuiles = ComposerHeaderTiles.tiles(for: [
            slideAvecMedia("a"), slideSansMedia("b")
        ])
        XCTAssertEqual(tuiles.map(\.id), ["a", "b"],
                       "une scène sans média reste une scène : la rangée la compte")
    }

    /// **Autant de tuiles que de scènes, toujours.** C'est l'invariant que la
    /// règle précédente ne pouvait pas tenir : elle comptait des médias, et deux
    /// médias sur une même scène — un fond et un objet posé — en auraient donné
    /// deux.
    func test_leCompte_suitLesScenes_jamaisLesMedias() {
        for scenes in [1, 2, 5] {
            let slides = (0..<scenes).map { slideSansMedia("s\($0)") }
            XCTAssertEqual(ComposerHeaderTiles.tiles(for: slides).count, scenes)
        }
    }

    /// **L'ORDRE est celui de la publication.** La rangée sert à savoir OÙ l'on
    /// est ; un ordre qui ne serait pas celui de lecture désignerait la mauvaise
    /// scène au doigt.
    func test_lOrdre_estCeluiDesScenes() {
        let slides = ["z", "a", "m"].map { slideSansMedia($0) }
        XCTAssertEqual(ComposerHeaderTiles.tiles(for: slides).map(\.id), ["z", "a", "m"])
    }

    /// Aucune scène ⇒ aucune rangée. Un rail vide occuperait la hauteur d'une
    /// bande pour ne rien dire (loi 4).
    func test_aucuneScene_aucuneTuile() {
        XCTAssertTrue(ComposerHeaderTiles.tiles(for: []).isEmpty)
    }
}
