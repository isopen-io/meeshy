import XCTest
@testable import Meeshy

/// #17901 · #16979 — la pile de trois couches d'effets, loi pure partagée par Effets et Montage
/// (miroir de `call-effect-layers.ts` côté web et de `CallEffectLayers.kt` côté Android) : les
/// six vecteurs communs, puis ce que la barre et la pile font de la configuration de l'appel.
@MainActor
final class CallEffectLayersTests: XCTestCase {

    private func layer(_ kind: CallEffectKind, _ choice: String) -> CallEffectLayer {
        CallEffectLayer(kind: kind, choice: choice)
    }

    private func stack(_ layers: CallEffectLayer...) -> CallEffectLayers {
        CallEffectLayers(layers)
    }

    private var frame: CallEffectLayer { layer(.frame, "frame-1") }
    private var filterA: CallEffectLayer { layer(.color, "golden") }
    private var filterB: CallEffectLayer { layer(.color, "film") }
    private var face: CallEffectLayer { layer(.face, "toad") }

    // MARK: - Les six vecteurs communs

    func test_adding_aFrameToAnEmptyStack_givesOneLayer() {
        XCTAssertEqual(CallEffectLayers().adding(frame), stack(frame))
    }

    func test_adding_aFilterAndAFaceOverAFrame_givesThreeLayers() {
        let result = stack(frame).adding(filterA).adding(face)
        XCTAssertEqual(result.bottomToTop, [frame, filterA, face])
        XCTAssertTrue(result.isFull)
    }

    func test_adding_aLandscapeToAFullStack_isRefusedAndTheStackStaysFull() {
        let full = stack(frame, filterA, face)
        let result = full.adding(layer(.landscape, "beach"))
        XCTAssertEqual(result, full)
        XCTAssertTrue(result.isFull)
    }

    func test_adding_anotherFilter_replacesTheFilterInPlace() {
        let result = stack(frame, filterA).adding(filterB)
        XCTAssertEqual(result.bottomToTop, [frame, filterB])
    }

    func test_removing_theMiddleLayer_keepsTheOthersInOrder() {
        let result = stack(frame, filterA, face).removing(.color)
        XCTAssertEqual(result.bottomToTop, [frame, face])
    }

    func test_removing_anAbsentLayer_changesNothing() {
        let before = stack(frame, face)
        XCTAssertEqual(before.removing(.color), before)
    }

    // MARK: - Au-delà des vecteurs

    func test_adding_aKindAlreadyPresentInAFullStack_stillReplacesInPlace() {
        let result = stack(frame, filterA, face).adding(filterB)
        XCTAssertEqual(result.bottomToTop, [frame, filterB, face])
        XCTAssertTrue(result.isFull)
    }

    func test_listed_goesFromTheTopLayerToTheBottomOne() {
        XCTAssertEqual(stack(frame, filterA, face).listed, [face, filterA, frame])
    }

    func test_choosing_nil_removesTheLayerOfThatKind() {
        XCTAssertEqual(stack(frame, filterA).choosing(.color, nil), stack(frame))
    }

    func test_choosing_aChoice_putsItOnTopWhenTheKindIsAbsent() {
        XCTAssertEqual(stack(frame).choosing(.face, "toad").bottomToTop, [frame, face])
    }

    func test_init_keepsOneLayerPerKind_andNeverMoreThanThree() {
        let crowded = CallEffectLayers([frame, filterA, filterB, face, layer(.landscape, "beach")])
        XCTAssertEqual(crowded.bottomToTop, [frame, filterA, face])
    }

    func test_allows_aKindOnlyWhenPresentOrWhenThereIsRoom() {
        let full = stack(frame, filterA, face)
        XCTAssertTrue(full.allows(.color))
        XCTAssertFalse(full.allows(.voice))
        XCTAssertTrue(stack(frame).allows(.voice))
    }

    // MARK: - (+) ouvre un genre absent

    func test_opening_picksTheFirstAbsentKindAfterTheCurrentOne() {
        XCTAssertEqual(CallEffectLayers().opening(after: .face, among: [.face, .color]), .color)
        XCTAssertNil(stack(face).opening(after: .color, among: [.face, .color]))
    }

    func test_opening_skipsKindsAlreadyInTheStack_andWrapsAround() {
        let layers = stack(filterA)
        XCTAssertEqual(layers.opening(after: .face, among: [.face, .color, .frame]), .frame)
        XCTAssertEqual(layers.opening(after: .frame, among: [.face, .color, .frame]), .face)
    }

    func test_opening_onAFullStack_opensNothing() {
        XCTAssertNil(stack(frame, filterA, face).opening(after: .face, among: CallEffectKind.allCases))
    }

    func test_opening_neverReturnsTheKindWeAreOn() {
        XCTAssertNil(CallEffectLayers().opening(after: .face, among: [.face]))
    }

    // MARK: - La pile et la configuration de l'appel

    func test_reconciling_putsANewlyChosenLookOnTop_andKeepsTheOrderOfTheOthers() {
        let base = stack(filterA, face)
        let config = CallEffectsModeRule.applying(color: .golden, to: VideoFilterConfig().selectingFaceEffect(.toad))
        let result = CallEffectsStackRule.layers(base, frame: "frame-1", config: config)
        XCTAssertEqual(result.bottomToTop, [filterA, face, frame])
    }

    func test_reconciling_dropsALookThatNoLongerHoldsInTheConfiguration() {
        let base = stack(frame, filterA, face)
        let config = VideoFilterConfig().selectingFaceEffect(.toad)
        let result = CallEffectsStackRule.layers(base, frame: nil, config: config)
        XCTAssertEqual(result.bottomToTop, [face])
    }

    func test_reconciling_aReplacedFilter_keepsItsPlace() {
        let base = stack(filterA, face)
        let config = CallEffectsModeRule.applying(color: .film, to: VideoFilterConfig().selectingFaceEffect(.toad))
        let result = CallEffectsStackRule.layers(base, frame: nil, config: config)
        XCTAssertEqual(result.bottomToTop, [filterB, face])
    }

    func test_removing_theColorLayer_clearsTheFilterAndKeepsTheFace() {
        let config = CallEffectsModeRule.applying(color: .golden, to: VideoFilterConfig().selectingFaceEffect(.toad))
        let result = CallEffectsStackRule.removing(.color, from: config)
        XCTAssertNil(result.activePreset)
        XCTAssertEqual(result.activeFaceEffect, .toad)
    }

    func test_removing_theFaceLayer_clearsTheFaceAndKeepsTheFilter() {
        let config = CallEffectsModeRule.applying(color: .golden, to: VideoFilterConfig().selectingFaceEffect(.toad))
        let result = CallEffectsStackRule.removing(.face, from: config)
        XCTAssertEqual(result.activeFaceEffect, .none)
        XCTAssertEqual(result.activePreset, .golden)
    }

    func test_removing_theFrameLayer_leavesTheConfigurationAlone() {
        let config = VideoFilterConfig().selectingFaceEffect(.toad)
        XCTAssertEqual(CallEffectsStackRule.removing(.frame, from: config), config)
    }

    // MARK: - (+) dans Effets : généralisation de « ajouter un autre look »

    func test_addingALook_fromFace_opensTheColorLooks() {
        XCTAssertEqual(CallEffectsModeRule.addingLook(from: .face, layers: stack(face)), .color)
    }

    func test_addingALook_fromColor_opensTheFaceLooks() {
        XCTAssertEqual(CallEffectsModeRule.addingLook(from: .color, layers: stack(filterA)), .face)
    }

    func test_addingALook_whenBothKindsAreApplied_stillLetsYouBrowseTheOtherKind() {
        XCTAssertEqual(CallEffectsModeRule.addingLook(from: .face, layers: stack(filterA, face)), .color)
    }

    func test_addingALook_onAFullStack_addsNothing() {
        XCTAssertNil(CallEffectsModeRule.addingLook(from: .face, layers: stack(frame, filterA, face)))
    }

    // MARK: - La barre revient au menu de base

    func test_bar_settingsToggles_betweenBaseAndSettings() {
        XCTAssertEqual(CallEffectsBarRule.afterSettings(from: .base), .settings)
        XCTAssertEqual(CallEffectsBarRule.afterSettings(from: .settings), .base)
        XCTAssertEqual(CallEffectsBarRule.afterSettings(from: .applied), .settings)
    }

    func test_bar_anyChoice_returnsToTheBaseMenu() {
        XCTAssertEqual(CallEffectsBarRule.afterAddingLook(from: .settings), .base)
        XCTAssertEqual(CallEffectsBarRule.afterAddingLook(from: .applied), .base)
        XCTAssertEqual(CallEffectsBarRule.afterRemoval, .base)
        XCTAssertEqual(CallEffectsBarRule.afterChoice, .base)
    }

    func test_bar_longPressOnPlus_opensTheAppliedList_onlyWhenThereIsOne() {
        XCTAssertEqual(CallEffectsBarRule.afterShowingApplied(from: .base, hasLayers: true), .applied)
        XCTAssertEqual(CallEffectsBarRule.afterShowingApplied(from: .settings, hasLayers: true), .applied)
        XCTAssertEqual(CallEffectsBarRule.afterShowingApplied(from: .base, hasLayers: false), .base)
    }

    func test_bar_aListThatLostItsLastLayer_closes() {
        XCTAssertEqual(CallEffectsBarRule.reconciled(.applied, hasLayers: false), .base)
        XCTAssertEqual(CallEffectsBarRule.reconciled(.applied, hasLayers: true), .applied)
        XCTAssertEqual(CallEffectsBarRule.reconciled(.settings, hasLayers: false), .settings)
    }

    func test_bar_looksShowOnlyOnTheBaseMenu() {
        XCTAssertTrue(CallEffectsBarRule.showsLooks(.base))
        XCTAssertFalse(CallEffectsBarRule.showsLooks(.settings))
        XCTAssertFalse(CallEffectsBarRule.showsLooks(.applied))
    }
}
