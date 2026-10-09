import XCTest
@testable import Meeshy

/// **La rangée haute de la capture, comme le porteur l'a dessinée** (#9753,
/// directive 2026-10-09).
@MainActor
final class ComposerCaptureTopRowTests: XCTestCase {

    private static func segment(_ duree: TimeInterval = 1) -> ComposerCaptureSegment {
        ComposerCaptureSegment(url: URL(fileURLWithPath: "/tmp/segment_\(UUID().uuidString).mov"), duration: duree)
    }

    private static func input(stage: ComposerSceneCameraStage = .armed, editing: Bool = false, segments: Int = 0,
                              size: Bool = true, save: Bool = false) -> ComposerCaptureTopRow.Input {
        ComposerCaptureTopRow.Input(stage: stage, editing: editing, pendingSegments: segments,
                                    offersSizeToggle: size, offersSave: save)
    }

    // MARK: - (1) La caméra à DROITE du flash

    func test_trailing_putsTheFlipRightOfTheFlash_atTheEdge() {
        let droite = ComposerCaptureTopRow.trailing(Self.input())
        XCTAssertEqual(droite, [.size, .flash, .flip])
        XCTAssertEqual(droite.last, .flip, "le retournement touche le bord droit")
    }

    func test_trailing_withoutSizeToggle_isFlashThenFlip() {
        XCTAssertEqual(ComposerCaptureTopRow.trailing(Self.input(size: false)), [.flash, .flip])
    }

    // MARK: - (3) Les contrôleurs de segment à GAUCHE des deux boutons

    func test_withPendingSegments_theSegmentControlsSitLeftOfFlashAndFlip() {
        let droite = ComposerCaptureTopRow.trailing(Self.input(segments: 2))
        XCTAssertEqual(droite, [.dropSegment, .validate, .flash, .flip])
        let flash = droite.firstIndex(of: .flash) ?? 0
        XCTAssertLessThan(droite.firstIndex(of: .dropSegment) ?? .max, flash)
        XCTAssertLessThan(droite.firstIndex(of: .validate) ?? .max, flash)
        XCTAssertFalse(droite.contains(.size), "sept contrôles tiennent sur un iPhone, pas huit : [ ] cède")
    }

    func test_whileRecording_onlyTheCrossAndTheChronoRemain() {
        let enregistre = Self.input(stage: .recording, segments: 1)
        XCTAssertEqual(ComposerCaptureTopRow.leading(enregistre), [.close, .chrono])
        XCTAssertEqual(ComposerCaptureTopRow.trailing(enregistre), [], "rien d'autre ne se règle en filmant")
    }

    // MARK: - (4) La puce du chrono à DROITE de (x)

    func test_theChrono_sitsRightOfTheCross_assoonAsAVideoIsBeingTaken() {
        XCTAssertEqual(ComposerCaptureTopRow.leading(Self.input()), [.close], "sans vidéo, pas de chrono")
        XCTAssertEqual(ComposerCaptureTopRow.leading(Self.input(segments: 1)), [.close, .chrono])
        XCTAssertEqual(ComposerCaptureTopRow.leading(Self.input(stage: .recording)), [.close, .chrono])
    }

    func test_theSegmentIndicator_countsTheSegmentBeingRecorded() {
        XCTAssertEqual(ComposerCaptureTopRow.segmentCount(pending: 0, recording: true), 1)
        XCTAssertEqual(ComposerCaptureTopRow.segmentCount(pending: 2, recording: true), 3)
        XCTAssertEqual(ComposerCaptureTopRow.segmentCount(pending: 2, recording: false), 2)
    }

    func test_whileEditing_theRowIsCrossThenSaveAndDone_withoutChronoFlashOrFlip() {
        let retouche = Self.input(editing: true, segments: 0, size: false, save: true)
        XCTAssertEqual(ComposerCaptureTopRow.leading(retouche), [.close])
        XCTAssertEqual(ComposerCaptureTopRow.trailing(retouche), [.save, .done])
    }

    // MARK: - Le curseur sous le flash, où qu'il soit

    func test_theFlashSlider_isInsetUnderTheFlash_byWhatSitsRightOfIt() {
        let cible: CGFloat = 44
        XCTAssertEqual(ComposerCaptureTopRow.flashSliderTrailingInset([.size, .flash, .flip], tapTarget: cible),
                       cible + ComposerCaptureTopRow.spacing, "un contrôle — le retournement — à droite du flash")
        XCTAssertEqual(ComposerCaptureTopRow.flashSliderTrailingInset([.flash], tapTarget: cible), 0)
        XCTAssertEqual(ComposerCaptureTopRow.flashSliderTrailingInset([.done], tapTarget: cible), 0,
                       "sans flash, rien à aligner")
    }

    // MARK: - (5) (x) pendant un enregistrement demande confirmation

    func test_closingWhileRecording_asksFirst_evenWithoutSegments() {
        XCTAssertTrue(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .recording, editing: false, segments: []))
    }

    func test_closingWithPendingSegments_stillAsks() {
        XCTAssertTrue(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .armed, editing: false,
                                                                  segments: [Self.segment()]))
    }

    func test_closingOutsideARecording_keepsItsBehaviour() {
        XCTAssertFalse(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .armed, editing: false, segments: []),
                       "rien à perdre : la croix ferme tout de suite")
        XCTAssertFalse(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .armed, editing: true, segments: []),
                       "en retouche, la croix abandonne la retouche, comme avant")
    }

    func test_theCross_goesThroughTheDiscardRule_andTheBarStaysWhileRecording() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerCaptureDiscardRule.asksBeforeClosing("),
                      "la croix et le glissé consultent la règle qui connaît l'enregistrement")
        XCTAssertFalse(chrome.contains("if session.stage != .recording {"),
                       "la croix reste là pendant la prise : on peut la toucher")
    }

    // MARK: - (2) Le curseur du flash s'efface après 2 s sans interaction

    func test_sliderTimer_hidesAfterItsLifetime_onlyForTheLastInteraction() {
        var minuterie = ComposerFlashSliderTimer()
        XCTAssertFalse(minuterie.visible)
        minuterie.touch()
        let premiere = minuterie.generation
        XCTAssertTrue(minuterie.visible)
        minuterie.touch()
        minuterie.expire(premiere, voiceOver: false)
        XCTAssertTrue(minuterie.visible, "une interaction réarme : l'échéance précédente est périmée")
        minuterie.expire(minuterie.generation, voiceOver: false)
        XCTAssertFalse(minuterie.visible)
        XCTAssertEqual(ComposerFlashSliderTimer.lifetime, 2)
    }

    func test_sliderTimer_aFingerOnTheSlider_holdsIt_andItsReleaseRearms() {
        var minuterie = ComposerFlashSliderTimer()
        minuterie.hold(true)
        minuterie.expire(minuterie.generation, voiceOver: false)
        XCTAssertTrue(minuterie.visible, "le curseur ne s'efface pas sous le doigt")
        minuterie.hold(false)
        XCTAssertTrue(minuterie.visible)
        minuterie.expire(minuterie.generation, voiceOver: false)
        XCTAssertFalse(minuterie.visible, "deux secondes après la levée")
    }

    func test_sliderTimer_staysWhileVoiceOverRuns_andHidesWithTheFlash() {
        var minuterie = ComposerFlashSliderTimer()
        minuterie.touch()
        minuterie.expire(minuterie.generation, voiceOver: true)
        XCTAssertTrue(minuterie.visible, "un élément qui s'efface sous VoiceOver n'est plus atteignable")
        minuterie.hide()
        XCTAssertFalse(minuterie.visible)
    }

    func test_theBar_wiresTheTimer_toTheSliderAndTheFlash() throws {
        let barre = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("ComposerFlashSliderTimer"), "la barre tient la minuterie")
        XCTAssertTrue(barre.contains(".task(id: sliderTimer.generation)"), "une seule échéance vit à la fois")
        XCTAssertTrue(barre.contains("ComposerCaptureTopRow.trailing("), "la disposition vient de la loi")
        XCTAssertTrue(barre.contains("ComposerCaptureTopRow.flashSliderTrailingInset("))
        let curseur = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerFlashIntensitySlider.swift")
        XCTAssertTrue(curseur.contains("onInteraction"), "glisser ou régler à la voix est une interaction")
    }

    // MARK: - Le rebond

    func test_aTouchedControl_bounces_andOnlyFadesUnderReduceMotion() {
        XCTAssertLessThan(ComposerControlBounce.scale(pressed: true, reduceMotion: false), 1)
        XCTAssertEqual(ComposerControlBounce.scale(pressed: true, reduceMotion: true), 1)
        XCTAssertLessThan(ComposerControlBounce.opacity(pressed: true, reduceMotion: true), 1)
        XCTAssertEqual(ComposerControlBounce.scale(pressed: false, reduceMotion: false), 1)
    }
}
