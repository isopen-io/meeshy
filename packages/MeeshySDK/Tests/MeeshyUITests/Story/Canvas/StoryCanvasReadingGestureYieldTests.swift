import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **En lecture, le canvas REND la main au défilement qui le contient**
/// (directive porteur 2026-09-06).
///
/// > « Le swipe gauche droite lorsqu'on a plusieurs images (en défilement
/// > continu ou image par image) ne fonctionne pas ! Même en plein écran
/// > impossible de swipe les scènes pour passer aux suivantes. »
///
/// ## Le défaut que ces témoins ferment
///
/// `setupGesturesAll()` attache un `UIPanGestureRecognizer` au canvas **sans
/// condition de mode**, et `handlePan` sort par `guard mode == .edit`. Le geste
/// ne produisait donc rien en lecture — et c'est précisément ce qui le rendait
/// invisible à la relecture : il avait l'air inoffensif.
///
/// Il ne l'était pas. **Un pan qui RECONNAÎT prive le `UIScrollView` parent de
/// son propre pan**, quel que soit le pager employé. Le carrousel de scènes
/// était donc muet partout à la fois — carte du fil, plein écran, `TabView`
/// paginé comme `ScrollView` + `scrollTargetBehavior(.paging)`.
///
/// > **Ne rien faire n'est pas la même chose que laisser passer.** Un garde
/// > posé dans le HANDLER arrive un cran trop tard : la décision qui compte est
/// > celle de RECONNAÎTRE.
///
/// ## Pourquoi ces témoins-là, et pas un test de défilement
///
/// Un test qui ferait glisser un pager mesurerait UIKit, pas cette règle — et
/// il faudrait un vrai doigt pour le rendre concluant. Ce que ces témoins
/// épinglent est la seule chose dont le canvas est responsable : **ce qu'il
/// accepte de reconnaître**. Le reste appartient au système.
///
/// Deux sessions ont conclu, séparément, que l'outil de simulation ne savait
/// pas produire un glissement paginé — parce qu'un outil muet et un produit
/// sourd rendent exactement le même silence. Ces témoins existent pour que la
/// prochaine question ne se pose plus à l'écran.
@MainActor
final class StoryCanvasReadingGestureYieldTests: XCTestCase {

    // MARK: - Fabrique

    private func canvas(mode: RenderMode) -> StoryCanvasUIView {
        let slide = StorySlide(
            id: "slide-temoin",
            effects: StoryEffects(textObjects: [StoryTextObject(id: "t1", text: "X")],
                                  timelineDuration: 3.0),
            duration: 3.0
        )
        let vue = StoryCanvasUIView(slide: slide, mode: mode)
        vue.frame = CGRect(x: 0, y: 0, width: 402, height: 716)
        return vue
    }

    // MARK: - LE témoin du lot

    /// **En lecture, le pan est REFUSÉ.** C'est lui qui volait le glissement du
    /// pager : sans ce refus, aucun carrousel de scènes ne tourne.
    func test_enLecture_lePanEstRefuse() {
        let vue = canvas(mode: .play)
        XCTAssertFalse(vue.gestureRecognizerShouldBegin(vue.panRecognizer),
                       "un pan reconnu en lecture prive le pager parent de son propre pan")
    }

    /// **En ÉDITION, le pan reste accepté** — c'est le geste qui déplace un
    /// objet sur la scène. Le témoin s'écrit sur l'autre mode parce qu'un
    /// refus posé trop large serait une régression du composer, invisible
    /// depuis le fil.
    func test_enEdition_lePanEstAccepte() {
        let vue = canvas(mode: .edit)
        XCTAssertTrue(vue.gestureRecognizerShouldBegin(vue.panRecognizer),
                      "l'édition doit garder le geste qui déplace un objet")
    }

    /// Les trois autres gestes de MANIPULATION suivent la même règle : ils
    /// transforment, donc ils n'ont rien à faire en lecture.
    func test_enLecture_lesGestesDeTransformationSontRefuses() {
        let vue = canvas(mode: .play)
        for recognizer in [vue.pinchRecognizer as UIGestureRecognizer,
                           vue.rotationRecognizer,
                           vue.canvasZoomPinchRecognizer] {
            XCTAssertFalse(vue.gestureRecognizerShouldBegin(recognizer))
        }
    }

    /// **Les TAPS restent acceptés en lecture, et c'est essentiel.**
    ///
    /// Ce sont eux qui ouvrent le plein écran. Un refus écrit par TYPE plutôt
    /// que par identité les aurait emportés avec les autres — le carrousel se
    /// serait remis à tourner et plus rien ne se serait ouvert. Le témoin
    /// existe pour que ce remède-là ne devienne pas la prochaine maladie.
    func test_enLecture_lesTapsRestentAcceptes() {
        let vue = canvas(mode: .play)
        XCTAssertTrue(vue.gestureRecognizerShouldBegin(vue.singleTapRecognizer),
                      "le tap simple ouvre le plein écran")
        XCTAssertTrue(vue.gestureRecognizerShouldBegin(vue.doubleTapRecognizer))
    }

    /// La partition elle-même, interrogée directement : elle range par
    /// IDENTITÉ, jamais par classe.
    func test_laPartitionRangeLesGestesParIdentite() {
        let vue = canvas(mode: .play)
        XCTAssertTrue(vue.isManipulationRecognizer(vue.panRecognizer))
        XCTAssertTrue(vue.isManipulationRecognizer(vue.pinchRecognizer))
        XCTAssertFalse(vue.isManipulationRecognizer(vue.singleTapRecognizer))
        XCTAssertFalse(vue.isManipulationRecognizer(vue.backgroundLongPressRecognizer))
    }
}
