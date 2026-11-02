import XCTest
@testable import Meeshy

/// **Importer plusieurs médias, une scène par média** (#8540, directive
/// porteur 2026-09-28).
final class ComposerScenePickingTests: XCTestCase {

    func test_plusieursMedias_fondentChacunLeurScene() {
        XCTAssertTrue(ComposerScenePicking.foundsScenes(count: 2, openingPick: false))
        XCTAssertTrue(ComposerScenePicking.foundsScenes(count: 10, openingPick: false))
    }

    /// Un média seul choisi par le rail se POSE sur la scène (une image sur une
    /// vidéo) : il ne crée pas de page.
    func test_unMediaSeulParLeRail_seposeSurLaScene() {
        XCTAssertFalse(ComposerScenePicking.foundsScenes(count: 1, openingPick: false))
    }

    /// Au choix d'OUVERTURE, il n'y a rien sur quoi poser : même un média seul
    /// fonde la première scène.
    func test_auChoixDOuverture_unMediaSeulFondeLaScene() {
        XCTAssertTrue(ComposerScenePicking.foundsScenes(count: 1, openingPick: true))
        XCTAssertFalse(ComposerScenePicking.foundsScenes(count: 0, openingPick: true))
    }

    func test_uneSerie_estToujoursUnFond() {
        XCTAssertEqual(ComposerMediaPlacement.role(door: .sceneSeries, currentSlideHasBackground: true), .background)
        XCTAssertEqual(ComposerMediaPlacement.role(door: .sceneSeries, currentSlideHasBackground: false), .background)
    }

    func test_laPhotothequeSOuvreALaCreation_dUnPost() {
        XCTAssertTrue(ComposerScenePicking.opensOnPicker(origin: .feedComposer, compositionIsEmpty: true))
    }

    /// **La story s'ouvre sur la scène, jamais sur Photos** (#13839, directive
    /// porteur du 2026-10-30) : la photothèque imposée à l'ouverture recouvrait
    /// la scène qu'on venait demander. Le bouton Média la sert d'un geste.
    func test_opensOnPicker_storyVierge_resteSurLaScene() {
        XCTAssertFalse(ComposerScenePicking.opensOnPicker(origin: .storyTray, compositionIsEmpty: true))
    }

    /// Jamais sur ce qui REPREND un contenu, ni sur l'humeur, ni sur une
    /// composition qui a déjà sa matière (brouillon restauré).
    func test_laPhotothequeNeSOuvrePas_surUneReprise() {
        for origine: ComposerOrigin in [.moodChip, .draft(id: "d"), .share,
                                         .edit(postId: "p", documentFormat: .story),
                                         .repost(ofPostId: "p", sourceFormat: .story)] {
            XCTAssertFalse(ComposerScenePicking.opensOnPicker(origin: origine, compositionIsEmpty: true), "\(origine)")
        }
        XCTAssertFalse(ComposerScenePicking.opensOnPicker(origin: .storyTray, compositionIsEmpty: false))
    }
}
