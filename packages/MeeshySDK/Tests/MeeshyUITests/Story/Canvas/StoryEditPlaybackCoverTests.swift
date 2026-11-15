import XCTest
import UIKit
import MeeshySDK
@testable import MeeshyUI

/// #12605 — **une scène recouverte se tait, et reprend à la fermeture.** Seuls les canevas
/// d'édition vivants à l'ouverture sont visés : celui de la couverture elle-même joue.
@MainActor
final class StoryEditPlaybackCoverTests: XCTestCase {

    private var fenetres: [UIWindow] = []

    override func tearDown() {
        fenetres.forEach { $0.isHidden = true }
        fenetres = []
        super.tearDown()
    }

    /// Un canevas du composer : fenêtré, vidéo et son d'édition levés.
    private func canvas() -> StoryCanvasUIView {
        let vue = StoryCanvasUIView(slide: StorySlide(effects: StoryEffects(background: "1E1B4B")), mode: .edit)
        let fenetre = UIWindow(frame: CGRect(x: 0, y: 0, width: 270, height: 480))
        fenetre.addSubview(vue)
        fenetres.append(fenetre)
        vue.playsVideoInEditMode = true
        vue.playsAudioInEditMode = true
        return vue
    }

    private func covered(_ vue: StoryCanvasUIView) -> Bool { StoryEditPlaybackCover.covers(vue) }

    func test_begin_coversTheLivingEditCanvases_andEndUncoversThem() {
        let scene = canvas()
        let couverture = StoryEditPlaybackCover.begin()
        XCTAssertTrue(covered(scene), "la scène sous la retouche se tait")
        StoryEditPlaybackCover.end(couverture)
        XCTAssertFalse(covered(scene), "la fermeture la rend à la lecture")
    }

    func test_aCanvasMountedDuringTheCover_isNotCovered() {
        let couverture = StoryEditPlaybackCover.begin()
        let dessus = canvas()
        XCTAssertFalse(covered(dessus), "le canevas de la couverture elle-même joue")
        StoryEditPlaybackCover.end(couverture)
    }

    func test_twoCovers_theSceneResumesOnlyWhenTheLastCloses() {
        let scene = canvas()
        let premiere = StoryEditPlaybackCover.begin()
        let seconde = StoryEditPlaybackCover.begin()
        StoryEditPlaybackCover.end(premiere)
        XCTAssertTrue(covered(scene), "une couverture reste posée")
        StoryEditPlaybackCover.end(seconde)
        XCTAssertFalse(covered(scene))
    }

    func test_endingTwice_neverUncoversAnotherCover() {
        let scene = canvas()
        let premiere = StoryEditPlaybackCover.begin()
        let seconde = StoryEditPlaybackCover.begin()
        StoryEditPlaybackCover.end(premiere)
        StoryEditPlaybackCover.end(premiere)
        XCTAssertTrue(covered(scene), "un jeton déjà rendu ne rend rien de plus")
        StoryEditPlaybackCover.end(seconde)
    }

    func test_aCoveredCanvas_doesNotRestartItsVideoLoop() {
        let scene = canvas()
        let couverture = StoryEditPlaybackCover.begin()
        scene.applyEditPlayback()
        XCTAssertFalse(scene.backgroundLayer.isPlaybackActive, "aucune porte ne relance la boucle d'une scène couverte")
        StoryEditPlaybackCover.end(couverture)
        XCTAssertTrue(scene.backgroundLayer.isPlaybackActive, "la fermeture la relance")
    }

    /// #13864 : la scène joue en continu, comme le player — une scène mise au
    /// repos sous la couverture retrouve son son ET sa vidéo à la fermeture.
    func test_aSceneThatIdledUnderTheCover_getsItsSoundAndItsVideoBack() {
        let scene = canvas()
        let couverture = StoryEditPlaybackCover.begin()
        scene._driveEditClockForTesting(now: CACurrentMediaTime() + 3_600)
        XCTAssertTrue(scene.isEditClockThrottled, "fusible : la scène s'est mise au repos sous la couverture")
        StoryEditPlaybackCover.end(couverture)
        XCTAssertTrue(scene.backgroundLayer.isPlaybackActive, "la vidéo repart sans attendre une touche")
    }
}
