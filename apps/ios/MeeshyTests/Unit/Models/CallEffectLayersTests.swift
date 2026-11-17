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

    // MARK: - UNE rangée de genres pour Effets et Montage (#16979)

    private var family: [CallEffectKind] { [.face, .color, .frame] }
    private var effectsOnly: [CallEffectKind] { [.face, .color] }

    func test_genreRow_isOneFamily_whateverTheMode() {
        XCTAssertEqual(CallEffectsGenreRule.row(offersEffects: true, offersFrames: true), family)
    }

    func test_genreRow_withoutTheMontage_keepsTheEffectsGenres() {
        XCTAssertEqual(CallEffectsGenreRule.row(offersEffects: true, offersFrames: false), effectsOnly)
    }

    func test_genreRow_withoutEffects_keepsTheFrames() {
        XCTAssertEqual(CallEffectsGenreRule.row(offersEffects: false, offersFrames: true), [.frame])
    }

    func test_genreName_isTheWordOfEachMode() {
        XCTAssertEqual(CallModeCopy.genreName(.face), CallModeCopy.categoryName(.face))
        XCTAssertEqual(CallModeCopy.genreName(.color), CallModeCopy.categoryName(.color))
        XCTAssertEqual(CallModeCopy.genreName(.frame), CallModeCopy.framesChip)
    }

    // MARK: - (+) ouvre un genre absent de la famille, d'abord dans le mode où l'on est

    func test_adding_fromFace_opensTheColorLooks() {
        XCTAssertEqual(CallEffectsGenreRule.adding(from: .face, layers: stack(face), row: family), .color)
    }

    func test_adding_fromColor_opensTheFaceLooks() {
        XCTAssertEqual(CallEffectsGenreRule.adding(from: .color, layers: stack(filterA), row: family), .face)
    }

    func test_adding_whenBothEffectsGenresAreApplied_opensTheFrames() {
        XCTAssertEqual(CallEffectsGenreRule.adding(from: .face, layers: stack(filterA, face), row: family), .frame)
    }

    func test_adding_withoutTheMontage_whenBothKindsAreApplied_stillLetsYouBrowseTheOtherKind() {
        XCTAssertEqual(CallEffectsGenreRule.adding(from: .face, layers: stack(filterA, face), row: effectsOnly), .color)
        XCTAssertEqual(CallEffectsGenreRule.adding(from: .color, layers: stack(filterA, face), row: effectsOnly), .face)
    }

    func test_adding_fromTheFrames_opensTheFirstAbsentEffectsGenre() {
        XCTAssertEqual(CallEffectsGenreRule.adding(from: .frame, layers: stack(frame), row: family), .face)
        XCTAssertEqual(CallEffectsGenreRule.adding(from: .frame, layers: stack(frame, face), row: family), .color)
    }

    func test_adding_fromTheFrames_withBothEffectsApplied_stillOpensEffects() {
        XCTAssertEqual(CallEffectsGenreRule.adding(from: .frame, layers: stack(filterA, face), row: family), .face)
    }

    func test_adding_fromTheFrames_whenEffectsAreNotOffered_opensNothing() {
        XCTAssertNil(CallEffectsGenreRule.adding(from: .frame, layers: stack(frame), row: [.frame]))
    }

    func test_adding_fromAGenreOutsideTheRow_opensNothing() {
        XCTAssertNil(CallEffectsGenreRule.adding(from: .frame, layers: CallEffectLayers(), row: effectsOnly))
    }

    func test_adding_onAFullStack_addsNothing() {
        XCTAssertNil(CallEffectsGenreRule.adding(from: .face, layers: stack(frame, filterA, face), row: family))
        XCTAssertNil(CallEffectsGenreRule.adding(from: .frame, layers: stack(frame, filterA, face), row: family))
    }

    // MARK: - La barre revient au menu de base

    private let allModes: [CallEffectsBarMode] = [.base, .looks, .settings, .applied]

    func test_bar_settingsToggles_betweenBaseAndSettings() {
        XCTAssertEqual(CallEffectsBarRule.afterSettings(from: .base), .settings)
        XCTAssertEqual(CallEffectsBarRule.afterSettings(from: .looks), .settings)
        XCTAssertEqual(CallEffectsBarRule.afterSettings(from: .settings), .base)
        XCTAssertEqual(CallEffectsBarRule.afterSettings(from: .applied), .settings)
    }

    /// P8 et C1 tels que dessinés : un mode s'ouvre sur le carrousel du genre où l'on entre.
    func test_bar_aModeOpensOnItsCarousel() {
        XCTAssertEqual(CallEffectsBarRule.entering, .looks)
    }

    /// C1 généralisée (2026-11-14, remplace #17962 point 2) : un look, une couleur, une
    /// déformation ou un cadre choisis referment le carrousel, en Effets comme en Montage, et la
    /// barre revient au menu de base. Annuler une couche fait de même.
    func test_bar_anyChoice_closesTheCarousel_andReturnsToTheBaseMenu() {
        XCTAssertEqual(CallEffectsBarRule.afterChoice, .base)
        XCTAssertEqual(CallEffectsBarRule.afterRemoval, .base)
        XCTAssertFalse(CallEffectsBarRule.showsCarousel(CallEffectsBarRule.afterChoice), "le carrousel ne reste pas après un choix")
    }

    /// (+) ouvre le carrousel d'un genre absent de la pile, d'où que l'on parte.
    func test_bar_addingALook_opensItsCarousel_fromAnyState() {
        for mode in allModes {
            XCTAssertEqual(CallEffectsBarRule.afterAddingLook(from: mode), .looks, "\(mode)")
        }
    }

    /// Un genre de la rangée ouvre son carrousel ; retoucher le genre déjà ouvert le referme.
    func test_bar_aGenre_opensItsCarousel_andTheOpenGenreClosesIt() {
        XCTAssertEqual(CallEffectsBarRule.afterGenre(from: .base, isOpen: false), .looks)
        XCTAssertEqual(CallEffectsBarRule.afterGenre(from: .looks, isOpen: false), .looks)
        XCTAssertEqual(CallEffectsBarRule.afterGenre(from: .looks, isOpen: true), .base)
        XCTAssertEqual(CallEffectsBarRule.afterGenre(from: .settings, isOpen: false), .looks)
        XCTAssertEqual(CallEffectsBarRule.afterGenre(from: .applied, isOpen: false), .looks)
    }

    /// Le genre pressé est celui dont le carrousel est ouvert ; au menu de base, aucun.
    func test_bar_theGenreIsPressed_onlyWhileItsCarouselIsOpen() {
        XCTAssertEqual(CallEffectsBarRule.pressed(.frame, in: .looks), .frame)
        XCTAssertEqual(CallEffectsBarRule.pressed(.face, in: .looks), .face)
        XCTAssertNil(CallEffectsBarRule.pressed(.frame, in: .base))
        XCTAssertNil(CallEffectsBarRule.pressed(.color, in: .settings))
        XCTAssertNil(CallEffectsBarRule.pressed(.face, in: .applied))
    }

    func test_bar_longPressOnPlus_opensTheAppliedList_onlyWhenThereIsOne() {
        XCTAssertEqual(CallEffectsBarRule.afterShowingApplied(from: .base, hasLayers: true), .applied)
        XCTAssertEqual(CallEffectsBarRule.afterShowingApplied(from: .looks, hasLayers: true), .applied)
        XCTAssertEqual(CallEffectsBarRule.afterShowingApplied(from: .settings, hasLayers: true), .applied)
        XCTAssertEqual(CallEffectsBarRule.afterShowingApplied(from: .base, hasLayers: false), .base)
        XCTAssertEqual(CallEffectsBarRule.afterShowingApplied(from: .looks, hasLayers: false), .looks)
    }

    func test_bar_aListThatLostItsLastLayer_closes() {
        XCTAssertEqual(CallEffectsBarRule.reconciled(.applied, hasLayers: false), .base)
        XCTAssertEqual(CallEffectsBarRule.reconciled(.applied, hasLayers: true), .applied)
        XCTAssertEqual(CallEffectsBarRule.reconciled(.settings, hasLayers: false), .settings)
        XCTAssertEqual(CallEffectsBarRule.reconciled(.looks, hasLayers: false), .looks)
    }

    /// La rangée Visage · Couleur · Cadres vit au menu de base et sous un carrousel ouvert ;
    /// réglages et liste resserrent la barre sur ‹ · Réglages · (+).
    func test_bar_theGenreRow_showsOnTheBaseMenuAndUnderAnOpenCarousel() {
        XCTAssertTrue(CallEffectsBarRule.showsLooks(.base))
        XCTAssertTrue(CallEffectsBarRule.showsLooks(.looks))
        XCTAssertFalse(CallEffectsBarRule.showsLooks(.settings))
        XCTAssertFalse(CallEffectsBarRule.showsLooks(.applied))
    }

    /// Le carrousel ne se montre que quand un genre l'a ouvert : jamais au menu de base.
    func test_bar_theCarousel_showsOnlyWhenAGenreOpenedIt() {
        XCTAssertTrue(CallEffectsBarRule.showsCarousel(.looks))
        XCTAssertFalse(CallEffectsBarRule.showsCarousel(.base))
        XCTAssertFalse(CallEffectsBarRule.showsCarousel(.settings))
        XCTAssertFalse(CallEffectsBarRule.showsCarousel(.applied))
    }

    // MARK: - #17947 — un réglage continu laisse le panneau ouvert

    /// Le panneau Luminosité · Flou du fond se referme par « Réglages » ou par ‹ : ‹ le referme
    /// par le chemin inverse de « Réglages » (la barre revient à son menu de base) ; ailleurs,
    /// ‹ revient à l'appel (`nil`).
    func test_bar_back_closesTheSettingsPanel_elseReturnsToTheCall() {
        XCTAssertEqual(CallEffectsBarRule.afterBack(from: .settings), .base)
        XCTAssertEqual(CallEffectsBarRule.afterBack(from: .settings), CallEffectsBarRule.afterSettings(from: .settings), "le même chemin que retoucher Réglages")
        XCTAssertNil(CallEffectsBarRule.afterBack(from: .base), "un second ‹ quitte le mode")
        XCTAssertNil(CallEffectsBarRule.afterBack(from: .looks))
        XCTAssertNil(CallEffectsBarRule.afterBack(from: .applied))
    }

    /// Un curseur ou un interrupteur n'est pas un choix discret : la pile qui gagne ou perd une
    /// couche pendant le réglage ne referme jamais le panneau (la fermeture automatique de #16979
    /// vaut pour un look ou un cadre).
    func test_bar_aContinuousSetting_neverClosesTheSettingsPanel() {
        XCTAssertEqual(CallEffectsBarRule.reconciled(.settings, hasLayers: true), .settings)
        XCTAssertEqual(CallEffectsBarRule.reconciled(.settings, hasLayers: false), .settings)
    }
}
