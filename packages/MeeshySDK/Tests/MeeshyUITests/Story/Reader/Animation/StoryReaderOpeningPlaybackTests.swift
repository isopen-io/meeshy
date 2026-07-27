// packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryReaderOpeningPlaybackTests.swift
import XCTest
import UIKit
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// L'ouverture d'un slide doit être rendue par le SDK — le MÊME code que
/// l'aperçu du composer et que l'export MP4.
///
/// Jusqu'ici elle ne l'était pas dans le LECTEUR. `applyOpening` n'était
/// appelée que depuis `setMode(_:time:)`, sous la garde `newMode == .play &&
/// !wasPlay`. Or le canvas du lecteur naît DIRECTEMENT en `.play`
/// (`StoryReaderRepresentable.makeUIView`), et `self.mode = mode` dans l'`init`
/// est une assignation stockée : elle ne passe pas par `setMode`. L'ouverture
/// du SDK ne s'exécutait donc jamais à la lecture, et une ré-implémentation
/// SwiftUI la remplaçait à l'écran avec ses propres constantes.
///
/// `StoryOpeningTests` couvre `applyOpening` posée sur un `CALayer` nu ; ces
/// tests-ci couvrent le CHEMIN — qui la déclenche, quand, avec quelles bounds,
/// et combien de fois.
@MainActor
final class StoryReaderOpeningPlaybackTests: XCTestCase {

    private static let viewport = CGRect(x: 0, y: 0, width: 412, height: 732)

    private func makeSlide(opening: StoryTransitionEffect?) -> StorySlide {
        StorySlide(id: UUID().uuidString,
                   effects: StoryEffects(background: "#112233", opening: opening),
                   duration: 8,
                   order: 0)
    }

    /// Slide dont la durée effective est ÉPINGLÉE.
    ///
    /// `StorySlide.duration` ne pilote rien : `computedTotalDuration()` lit
    /// `effects.timelineDuration` en priorité, et à défaut dérive du contenu —
    /// une slide statique retombe sur un plancher de 6 s. Sans ce pin, la
    /// fenêtre de fermeture ne serait pas là où le test la croit.
    private static func transitionSlide(opening: StoryTransitionEffect,
                                        closing: StoryTransitionEffect) -> StorySlide {
        StorySlide(id: UUID().uuidString,
                   effects: StoryEffects(background: "#112233",
                                         opening: opening,
                                         closing: closing,
                                         timelineDuration: 2),
                   duration: 2,
                   order: 0)
    }

    /// Reproduit la naissance d'un canvas de LECTEUR, dans l'ordre réel : créé
    /// en `.play`, dimensionné et posé par SwiftUI, puis — plus tard — le
    /// contenu atterrit.
    ///
    /// Le forçage du signal de contenu n'est pas une commodité de test : c'est
    /// la seconde condition de l'ouverture. Tant que le média n'a pas atterri,
    /// le lecteur couvre le canvas d'un placeholder opaque, et l'ouverture —
    /// une animation CoreAnimation, qui court en temps réel — s'y consumerait
    /// sans témoin. Le seam force ici ce que le réseau fournit en vrai.
    private func makeReaderCanvas(opening: StoryTransitionEffect?) -> StoryCanvasUIView {
        makeReaderCanvas(slide: makeSlide(opening: opening))
    }

    private func makeReaderCanvas(slide: StorySlide) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .play)
        view.frame = Self.viewport
        view.setNeedsLayout()
        view.layoutIfNeeded()
        view._forceContentReadyForTesting()
        return view
    }

    // MARK: - Le lecteur joue bien l'ouverture du SDK

    func test_canvasBornInPlay_playsSdkZoomOpening() {
        let view = makeReaderCanvas(opening: .zoom)
        XCTAssertNotNil(view.rootLayer.animation(forKey: "opening-zoom"),
                        "Le lecteur doit jouer l'ouverture du SDK, pas une ré-implémentation.")
    }

    func test_canvasBornInPlay_playsSdkSlideOpening() {
        let view = makeReaderCanvas(opening: .slide)
        XCTAssertNotNil(view.rootLayer.animation(forKey: "opening-slide"))
    }

    func test_canvasBornInPlay_playsSdkFadeOpening() {
        let view = makeReaderCanvas(opening: .fade)
        XCTAssertNotNil(view.rootLayer.animation(forKey: "opening-fade"))
    }

    /// La révélation part d'un cercle FERMÉ. Un masque installé déjà plein
    /// écran passerait toutes les assertions de présence — et le cercle ne
    /// s'ouvrirait jamais.
    func test_canvasBornInPlay_playsSdkRevealOpening_startingClosed() throws {
        let view = makeReaderCanvas(opening: .reveal)
        let mask = try XCTUnwrap(view.rootLayer.mask as? CAShapeLayer,
                                 "`.reveal` masque le rootLayer d'un cercle qui s'élargit.")
        let anim = try XCTUnwrap(mask.animation(forKey: "opening-reveal") as? CABasicAnimation)

        let start = try XCTUnwrap(anim.fromValue as! CGPath?)
        let end = try XCTUnwrap(anim.toValue as! CGPath?)
        XCTAssertLessThan(start.boundingBox.width, end.boundingBox.width,
                          "Le cercle doit s'OUVRIR : il part plus petit qu'il n'arrive.")
        XCTAssertGreaterThan(end.boundingBox.width, Self.viewport.width,
                             "À l'arrivée, le cercle doit couvrir tout le canvas.")
    }

    /// Le zoom part de l'échelle du SDK et retombe à l'identité. Câbler
    /// `fromValue` sur l'identité laisserait l'animation en place — et
    /// l'ouverture ne bougerait plus rien.
    func test_zoomOpening_startsAtTheSdkScale_andSettlesAtIdentity() throws {
        let view = makeReaderCanvas(opening: .zoom)
        let anim = try XCTUnwrap(view.rootLayer.animation(forKey: "opening-zoom") as? CABasicAnimation)

        let from = try XCTUnwrap(anim.fromValue as? NSValue).caTransform3DValue
        let to = try XCTUnwrap(anim.toValue as? NSValue).caTransform3DValue
        XCTAssertEqual(from.m11, StoryRenderer.zoomTransitionScale, accuracy: 0.0001)
        XCTAssertEqual(to.m11, 1, accuracy: 0.0001)
    }

    // MARK: - Avec les VRAIES bounds

    /// Le débattement de `.slide` est une FRACTION de la largeur du canvas.
    /// Jouer l'ouverture depuis l'`init` — quand `bounds` vaut encore `.zero` —
    /// donnerait un débattement nul : l'animation existerait, mais ne
    /// déplacerait rien. La preuve que l'ouverture est armée APRÈS le layout
    /// est donc dans sa valeur de départ, pas dans sa présence.
    func test_slideOpening_isArmedWithTheRealViewportWidth() throws {
        let view = makeReaderCanvas(opening: .slide)
        let anim = try XCTUnwrap(view.rootLayer.animation(forKey: "opening-slide") as? CABasicAnimation)
        let from = try XCTUnwrap(anim.fromValue as? NSValue).caTransform3DValue
        let expected = Self.viewport.width * StoryRenderer.slideTransitionTravelFraction
        XCTAssertEqual(from.m41, expected, accuracy: 0.5,
                       "Débattement calculé sur des bounds nulles — l'ouverture a été armée trop tôt.")
    }

    // MARK: - Une seule fois

    /// `layoutSubviews` est appelé à chaque re-layout (rotation, resize,
    /// reconfiguration). Réarmer l'ouverture à chacun ferait re-zoomer la
    /// slide en pleine lecture.
    func test_openingPlaysOnlyOnce_acrossRepeatedLayouts() {
        let view = makeReaderCanvas(opening: .zoom)
        view.rootLayer.removeAnimation(forKey: "opening-zoom")

        view.setNeedsLayout()
        view.layoutIfNeeded()

        XCTAssertNil(view.rootLayer.animation(forKey: "opening-zoom"),
                     "L'ouverture a rejoué sur un simple re-layout.")
    }

    // MARK: - Le canvas sortant reste muet

    /// Le canvas SORTANT du cross-fade naît en `.edit` pour ne rien démarrer.
    /// Il ne doit pas non plus jouer d'ouverture : il est en train de
    /// disparaître.
    func test_canvasBornInEdit_doesNotPlayOpening() {
        let view = StoryCanvasUIView(slide: makeSlide(opening: .zoom), mode: .edit)
        view.frame = Self.viewport
        view.setNeedsLayout()
        view.layoutIfNeeded()
        view._forceContentReadyForTesting()

        XCTAssertNil(view.rootLayer.animation(forKey: "opening-zoom"))
    }

    /// Le composer garde son chemin historique : c'est le passage
    /// `.edit → .play` qui joue l'ouverture de l'aperçu.
    func test_editToPlayTransition_stillPlaysOpening() {
        let view = StoryCanvasUIView(slide: makeSlide(opening: .zoom), mode: .edit)
        view.frame = Self.viewport
        view.setNeedsLayout()
        view.layoutIfNeeded()

        view.setMode(.play, time: .zero)
        // Passer en `.play` reconstruit les couches, ce qui REPROGRAMME
        // l'évaluation du contenu (`scheduleContentReadyEvaluation` repart de
        // `contentReadyFired = false`). L'ouverture attend donc le nouveau
        // signal, comme à la lecture.
        view._forceContentReadyForTesting()

        XCTAssertNotNil(view.rootLayer.animation(forKey: "opening-zoom"))
    }

    // MARK: - L'ouverture attend que le contenu soit là

    /// L'ouverture est une animation CoreAnimation : elle court en TEMPS RÉEL,
    /// pas au playhead. Jouée au premier layout, elle se consumerait derrière le
    /// placeholder opaque que le lecteur affiche pendant le chargement — et le
    /// contenu réel apparaîtrait au repos, sans effet. C'est le cas le plus
    /// fréquent en production, où les médias sont distants.
    ///
    /// Le gate s'aligne sur celui du playhead (`advancePlayheadIfActive`) : la
    /// story commence à jouer et à s'ouvrir au même instant.
    func test_openingDoesNotPlayBeforeContentIsReady() {
        let view = StoryCanvasUIView(slide: makeSlide(opening: .zoom), mode: .play)
        view.frame = Self.viewport
        view.setNeedsLayout()
        view.layoutIfNeeded()

        XCTAssertNil(view.rootLayer.animation(forKey: "opening-zoom"),
                     "L'ouverture a brûlé derrière le placeholder de chargement.")
    }

    /// …et elle part dès que le contenu atterrit, sans nouveau layout.
    func test_openingPlaysWhenContentLands() {
        let view = StoryCanvasUIView(slide: makeSlide(opening: .zoom), mode: .play)
        view.frame = Self.viewport
        view.setNeedsLayout()
        view.layoutIfNeeded()

        view._forceContentReadyForTesting()

        XCTAssertNotNil(view.rootLayer.animation(forKey: "opening-zoom"))
    }

    /// Un contenu prêt AVANT que SwiftUI ait donné une géométrie ne doit pas
    /// GÂCHER l'ouverture : rien ne se joue (le débattement serait nul), mais
    /// l'armement survit et repart au signal suivant.
    ///
    /// C'est ce qui rend l'ordre des deux signaux indifférent — et c'est aussi
    /// la raison pour laquelle l'armement n'est consommé qu'en cas de succès.
    func test_openingIsNotWastedWhenContentLandsBeforeGeometry() {
        let view = StoryCanvasUIView(slide: makeSlide(opening: .zoom), mode: .play)

        view._forceContentReadyForTesting()
        XCTAssertNil(view.rootLayer.animation(forKey: "opening-zoom"),
                     "Sans bounds, le débattement serait nul — rien ne doit être consommé.")

        view.frame = Self.viewport
        view.setNeedsLayout()
        view.layoutIfNeeded()
        view._forceContentReadyForTesting()

        XCTAssertNotNil(view.rootLayer.animation(forKey: "opening-zoom"),
                        "L'armement a été perdu par un signal arrivé trop tôt.")
    }

    // MARK: - L'ouverture rend la main à la fermeture

    /// `applyOpening` installe ses animations en `fillMode = .forwards` avec
    /// `isRemovedOnCompletion = false` : elles restent attachées à la couche et
    /// CLAMPENT la propriété présentée à leur `toValue`, indéfiniment.
    ///
    /// Or la fermeture écrit le MODÈLE des mêmes propriétés à chaque tick
    /// (`sublayerTransform` pour `.zoom`/`.slide`, `opacity` pour `.fade`).
    /// Tant que l'animation d'ouverture est là, ces écritures ne se voient pas :
    /// l'auteur qui choisit « zoom à l'entrée, zoom à la sortie » — l'appariement
    /// le plus naturel — perdrait purement et simplement sa sortie.
    ///
    /// Le lecteur n'appelait jamais `applyOpening` avant la fusion des
    /// renderers ; la collision était donc latente au composer et ce chemin-ci
    /// la rendait visible partout.
    func test_closingWindow_clearsTheOpeningAnimation() {
        let slide = Self.transitionSlide(opening: .zoom, closing: .zoom)
        let view = makeReaderCanvas(slide: slide)
        XCTAssertNotNil(view.rootLayer.animation(forKey: "opening-zoom"),
                        "Préalable : l'ouverture doit bien avoir joué.")

        // La fenêtre de sortie occupe les `slideTransitionDuration` dernières
        // secondes ; on se place à la moitié de celle-ci.
        view.simulateTickAt(seconds: slide.computedTotalDuration()
                            - StoryRenderer.slideTransitionDuration / 2)

        XCTAssertNil(view.rootLayer.animation(forKey: "opening-zoom"),
                     "L'ouverture clampe encore la couche : la fermeture est invisible.")
    }

    /// Symétrique : tant qu'on n'est PAS dans la fenêtre de fermeture,
    /// l'ouverture doit vivre sa vie. La retirer à chaque tick l'amputerait dès
    /// la première frame.
    func test_openingSurvivesTicksBeforeTheClosingWindow() {
        let view = makeReaderCanvas(slide: Self.transitionSlide(opening: .zoom, closing: .zoom))

        view.simulateTickAt(seconds: 0.2)

        XCTAssertNotNil(view.rootLayer.animation(forKey: "opening-zoom"),
                        "L'ouverture a été coupée en pleine course.")
    }

    // MARK: - Rejouer sur demande

    /// L'interlude inter-groupes est un `.overlay` POSÉ SUR le canvas : la
    /// story naît dessous et joue son ouverture à l'abri du voile, donc
    /// invisible. Au retrait du voile, l'app doit pouvoir la redemander —
    /// sinon la story apparaît déjà au repos et la grammaire de l'auteur est
    /// perdue (comportement livré le 2026-07-26, à ne pas régresser).
    func test_replayOpening_rearmsTheSdkAnimation() {
        let view = makeReaderCanvas(opening: .zoom)
        view.rootLayer.removeAnimation(forKey: "opening-zoom")

        view.replayOpening()

        XCTAssertNotNil(view.rootLayer.animation(forKey: "opening-zoom"))
    }

    /// Une story sans effet d'ouverture ne doit rien jouer, même sur demande
    /// explicite.
    func test_replayOpening_withoutEffect_staysSilent() {
        let view = makeReaderCanvas(opening: nil)

        view.replayOpening()

        XCTAssertTrue(view.rootLayer.animationKeys()?.isEmpty ?? true)
    }

    // MARK: - Pas d'effet, pas d'animation

    func test_noOpeningEffect_leavesRootLayerUntouched() {
        let view = makeReaderCanvas(opening: nil)
        XCTAssertNil(view.rootLayer.mask)
        XCTAssertTrue(view.rootLayer.animationKeys()?.isEmpty ?? true)
    }
}
