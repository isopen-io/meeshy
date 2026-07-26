import XCTest
@testable import Meeshy

/// Une surface ouverte doit se refermer AVANT que quoi que ce soit d'autre
/// n'arrive — y compris la fermeture du lecteur.
///
/// L'invariant était tenu au TOUCHER (`StoryReaderCanvas`, garde `hasActiveFeature`
/// au touch-down : le premier contact referme la surface et rien d'autre ne se
/// produit) mais PAS au GLISSEMENT vertical : `StoryVerticalGestureDecisions.decide`
/// ignorait complètement l'état des surfaces. Un swipe vers le bas alors que le
/// strip de langues, la barre d'emojis, l'overlay de commentaires ou la
/// transcription étaient ouverts fermait le lecteur d'un coup — l'utilisateur
/// perdait la story ET son overlay, alors qu'il voulait juste refermer ce
/// dernier.
///
/// La règle retenue vaut pour les DEUX directions, par cohérence avec la garde
/// du toucher : tant qu'une surface est ouverte, tout geste vertical de
/// dismissal lui revient.
/// `@MainActor` comme `StoryGestureDecisionsTests` : le target app compile en
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, donc `StoryVerticalGestureAction`
/// et sa conformance `Equatable` sont isolées. Une suite nonisolated ne peut ni
/// appeler `decide` ni comparer ses résultats.
@MainActor
final class StoryVerticalGestureFeatureGuardTests: XCTestCase {

    private let threshold: CGFloat = 120

    private func decide(translationY: CGFloat,
                        predictedY: CGFloat? = nil,
                        isFullscreen: Bool = false,
                        hasActiveFeature: Bool) -> StoryVerticalGestureAction {
        StoryVerticalGestureDecisions.decide(
            translationY: translationY,
            predictedY: predictedY ?? translationY,
            isFullscreen: isFullscreen,
            threshold: threshold,
            hasActiveFeature: hasActiveFeature
        )
    }

    // MARK: - Le défaut corrigé

    func test_swipeDown_withOpenFeature_closesTheFeature_notTheViewer() {
        XCTAssertEqual(
            decide(translationY: 300, hasActiveFeature: true),
            .dismissActiveFeature,
            "un swipe bas sur un overlay ouvert doit refermer l'overlay, jamais éjecter de la story"
        )
    }

    func test_swipeDownInFullscreen_withOpenFeature_closesTheFeature() {
        XCTAssertEqual(
            decide(translationY: 300, isFullscreen: true, hasActiveFeature: true),
            .dismissActiveFeature,
            "même en plein écran, la surface passe avant le changement de mode"
        )
    }

    func test_swipeUp_withOpenFeature_closesTheFeature_ratherThanEnteringFullscreen() {
        XCTAssertEqual(
            decide(translationY: -300, hasActiveFeature: true),
            .dismissActiveFeature,
            "cohérence avec la garde du toucher : la surface consomme le geste, dans les deux sens"
        )
    }

    /// Sous le seuil, rien ne se passe : un micro-mouvement ne doit pas fermer
    /// une surface que l'utilisateur est peut-être en train de lire.
    func test_belowThreshold_withOpenFeature_cancels() {
        XCTAssertEqual(
            decide(translationY: 40, hasActiveFeature: true),
            .cancel,
            "un geste qui ne franchit pas le seuil reste sans effet, surface ouverte ou non"
        )
    }

    // MARK: - Contrôle positif — sans surface, rien ne change

    func test_swipeDown_withoutFeature_stillDismissesTheViewer() {
        XCTAssertEqual(decide(translationY: 300, hasActiveFeature: false), .dismissViewer)
    }

    func test_swipeDownInFullscreen_withoutFeature_stillExitsFullscreen() {
        XCTAssertEqual(
            decide(translationY: 300, isFullscreen: true, hasActiveFeature: false),
            .exitFullscreen
        )
    }

    func test_swipeUp_withoutFeature_stillEntersFullscreen() {
        XCTAssertEqual(decide(translationY: -300, hasActiveFeature: false), .enterFullscreen)
    }

    /// Le flick court mais rapide reste validé par la prédiction — la garde ne
    /// doit pas avoir neutralisé ce chemin.
    func test_shortFastFlickDown_withoutFeature_stillDismisses() {
        XCTAssertEqual(
            decide(translationY: 30, predictedY: 400, hasActiveFeature: false),
            .dismissViewer
        )
    }
}
