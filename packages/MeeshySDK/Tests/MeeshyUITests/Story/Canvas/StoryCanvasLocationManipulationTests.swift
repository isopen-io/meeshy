import XCTest
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 20 — une pastille posée doit être SÉLECTIONNABLE, DÉPLAÇABLE,
/// REDIMENSIONNABLE, PIVOTABLE et SUPPRIMABLE comme un texte. Sans cas dédié
/// dans l'énumération de sélection ni branche dans les mutateurs, la pastille
/// était un décor inerte : le doigt la traversait et rien ne pouvait la retirer.
@MainActor
final class StoryCanvasLocationManipulationTests: XCTestCase {

    private func badge(id: String = "loc-1", x: Double = 0.5, y: Double = 0.8) -> StoryLocationObject {
        StoryLocationObject(id: id,
                            place: SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                               name: "Tour Eiffel"),
                            x: x, y: y)
    }

    private func makeCanvas(_ objects: [StoryLocationObject]) -> StoryCanvasUIView {
        var slide = StorySlide(id: "s")
        slide.locationObjects = objects
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.rebuildLayers()
        return canvas
    }

    func test_itemKind_ofALocationBadge_isLocation() {
        let canvas = makeCanvas([badge()])
        XCTAssertEqual(canvas.itemKind(forId: "loc-1"), .place,
                       "Sans cas dédié, la pastille n'est ni sélectionnable ni déplaçable.")
    }

    /// La couche `.foreground` doit s'activer sur une slide qui ne porte QU'une
    /// pastille : en `.canvas` tous les gestes sont absorbés et le badge reste
    /// figé où il a été posé.
    func test_aSlideCarryingOnlyALocationBadge_hasForegroundContent() {
        var effects = StoryEffects()
        effects.locationObjects = [badge()]
        XCTAssertEqual(StoryCanvasUIView.resolveManipulationLayer(for: effects), .foreground)
    }

    func test_dragging_movesTheLocationBadge() {
        let canvas = makeCanvas([badge()])
        let moved = canvas.updatePosition(slideId: "loc-1", x: 0.2, y: 0.35)
        XCTAssertEqual(moved.locationObjects.first?.x ?? -1, 0.2, accuracy: 0.0001)
        XCTAssertEqual(moved.locationObjects.first?.y ?? -1, 0.35, accuracy: 0.0001)
    }

    func test_pinchAndRotation_resizeAndTurnTheLocationBadge() {
        let canvas = makeCanvas([badge()])
        XCTAssertEqual(canvas.currentScale(forId: "loc-1") ?? -1, 1.0, accuracy: 0.0001)
        XCTAssertEqual(canvas.currentRotation(forId: "loc-1") ?? -1, 0, accuracy: 0.0001)

        canvas.slide = canvas.updateScale(slideId: "loc-1", scale: 1.6)
        canvas.slide = canvas.updateRotation(slideId: "loc-1", rotation: 18)

        XCTAssertEqual(canvas.slide.locationObjects.first?.scale ?? -1, 1.6, accuracy: 0.0001)
        XCTAssertEqual(canvas.slide.locationObjects.first?.rotation ?? -1, 18, accuracy: 0.0001)
    }

    func test_deleteItem_removesTheLocationBadge() {
        let canvas = makeCanvas([badge()])
        canvas.deleteItem(id: "loc-1")
        XCTAssertTrue(canvas.slide.locationObjects.isEmpty,
                      "Une pastille qu'on ne peut pas retirer condamne la slide à la porter.")
    }

    func test_contextDelete_removesTheLocationBadge() {
        let canvas = makeCanvas([badge()])
        canvas.contextDelete(id: "loc-1")
        XCTAssertTrue(canvas.slide.locationObjects.isEmpty)
    }

    func test_duplicate_clonesTheLocationBadgeSlightlyOffset() {
        let canvas = makeCanvas([badge()])
        canvas.duplicateItem(id: "loc-1")
        XCTAssertEqual(canvas.slide.locationObjects.count, 2)
        let clone = canvas.slide.locationObjects.last
        XCTAssertNotEqual(clone?.id, "loc-1")
        XCTAssertEqual(clone?.x ?? -1, 0.55, accuracy: 0.0001)
    }

    /// Le z-order d'un nouvel élément doit tenir compte des pastilles déjà
    /// posées, sinon un texte ajouté après hérite du même z et l'ordre est
    /// indéterminé.
    func test_nextTopZ_countsLocationBadges() {
        var high = badge()
        high.zIndex = 7
        let canvas = makeCanvas([high])
        XCTAssertEqual(canvas.nextTopZ(), 8)
    }

    // MARK: - Suivi LIVE de la layer pendant le geste

    /// Le modèle bougeait mais la CALayer restait figée pendant tout le drag
    /// (aucune branche location dans `updateManipulatedItemLayer`) : la
    /// pastille téléportait à sa position finale au relâchement (constat user
    /// 2026-07-30 « le sticker de position ne bouge pas »). Ce test verrouille
    /// la LAYER, pas le modèle — les huit tests au-dessus passaient déjà.
    func test_liveDrag_movesTheBadgeLayer_beforeGestureEnd() {
        let canvas = makeCanvas([badge(x: 0.5, y: 0.8)])
        let layer = canvas.itemsContainer.sublayers?.first { $0.name == "loc-1" }
        let positionBefore = layer?.position ?? .zero

        canvas.manipulatedItemId = "loc-1"
        canvas.slide = canvas.updatePosition(slideId: "loc-1", x: 0.2, y: 0.3)

        let positionAfter = layer?.position ?? .zero
        XCTAssertNotEqual(positionBefore, positionAfter,
                          "La layer doit suivre le doigt PENDANT le geste, pas seulement au rebuild final.")
    }

    /// Même contrat pour le pinch : le scale est cuit dans la rasterisation du
    /// badge, donc le suivi live passe par un transform transitoire (motif
    /// texte). Sans lui, `transform` reste l'identité jusqu'au relâchement.
    func test_livePinch_scalesTheBadgeLayer_beforeGestureEnd() {
        let canvas = makeCanvas([badge()])
        let layer = canvas.itemsContainer.sublayers?.first { $0.name == "loc-1" }

        canvas.manipulatedItemId = "loc-1"
        canvas.slide = canvas.updateScale(slideId: "loc-1", scale: 1.8)

        let transform = layer?.transform ?? CATransform3DIdentity
        XCTAssertEqual(Double(transform.m11), 1.8, accuracy: 0.001,
                       "Le ratio transitoire (scale modèle ÷ scale cuit) doit s'appliquer pendant le pinch.")
    }
}
