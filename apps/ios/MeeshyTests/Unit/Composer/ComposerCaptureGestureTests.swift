import XCTest
@testable import Meeshy

/// **Chaque geste a UN effet, lu dans une table** (#9351, spec § 3.1 / § 3.2 / § 7).
@MainActor
final class ComposerCaptureGestureTests: XCTestCase {

    private func action(_ zone: ComposerCaptureZone, _ geste: ComposerCaptureGestureKind,
                        _ contexte: ComposerCaptureGestureContext = ComposerCaptureGestureContext()) -> ComposerCaptureAction {
        ComposerCaptureGesture.action(zone: zone, gesture: geste, context: contexte)
    }

    func test_action_sceneArmed_tapFocuses_doubleTapEdits_longPressFilmsASegment() {
        XCTAssertEqual(action(.scene, .tap), .focus)
        XCTAssertEqual(action(.scene, .doubleTap), .photoToEdit)
        XCTAssertEqual(action(.scene, .longPress), .filmSegment)
        XCTAssertEqual(action(.scene, .pinch), .zoom)
        XCTAssertEqual(action(.scene, .drag), .close)
    }

    func test_action_chosenThumbnailArmed_doubleTapAndLongPress_goToTheGallery() {
        XCTAssertEqual(action(.chosenThumbnail, .doubleTap), .photoToGallery)
        XCTAssertEqual(action(.chosenThumbnail, .longPress), .filmToGallery)
        XCTAssertEqual(action(.otherThumbnail, .tap), .select)
        XCTAssertEqual(action(.rail, .tap), .openFamily)
    }

    func test_action_recording_dragZooms_railAndOtherThumbnailsAreInert() {
        let enCours = ComposerCaptureGestureContext(stage: .recording)
        XCTAssertEqual(action(.scene, .drag, enCours), .zoom)
        XCTAssertEqual(action(.scene, .tap, enCours), .focus, "en cours de prise, tout toucher vise")
        XCTAssertEqual(action(.rail, .tap, enCours), .none, "aucun effet n'est choisissable pendant l'enregistrement")
        XCTAssertEqual(action(.otherThumbnail, .tap, enCours), .none)
        XCTAssertEqual(action(.scene, .doubleTap, enCours), .none)
    }

    func test_action_lockedRecording_tapOnChosenThumbnailStops() {
        XCTAssertEqual(action(.chosenThumbnail, .tap, ComposerCaptureGestureContext(stage: .recording, locked: true)), .stopTake)
        XCTAssertEqual(action(.chosenThumbnail, .tap, ComposerCaptureGestureContext(stage: .recording, locked: false)), .none)
    }

    func test_action_holding_dragSteersTheTake() {
        XCTAssertEqual(action(.scene, .drag, ComposerCaptureGestureContext(stage: .recording, holding: true)), .steerTake)
        XCTAssertEqual(action(.chosenThumbnail, .drag, ComposerCaptureGestureContext(stage: .recording, holding: true)), .steerTake)
    }

    func test_action_pendingSegments_noPhotoNoGalleryTake_butSegmentsContinue() {
        let segments = ComposerCaptureGestureContext(pendingSegments: 2)
        XCTAssertEqual(action(.scene, .doubleTap, segments), .none, "une photo jetterait les segments en attente")
        XCTAssertEqual(action(.chosenThumbnail, .longPress, segments), .none)
        XCTAssertEqual(action(.scene, .longPress, segments), .filmSegment, "la relance des segments reste")
        XCTAssertEqual(action(.otherThumbnail, .tap, segments), .none, "le look ne change plus une fois la prise commencée")
    }

    func test_action_formatWithoutPhoto_doubleTapIsInert() {
        let videoSeule = ComposerCaptureGestureContext(allowsPhoto: false)
        XCTAssertEqual(action(.scene, .doubleTap, videoSeule), .none)
        XCTAssertEqual(action(.chosenThumbnail, .doubleTap, videoSeule), .none)
    }

    func test_action_formatWithoutVideo_longPressIsInert() {
        let photoSeule = ComposerCaptureGestureContext(allowsVideo: false)
        XCTAssertEqual(action(.scene, .longPress, photoSeule), .none)
        XCTAssertEqual(action(.chosenThumbnail, .longPress, photoSeule), .none)
    }

    func test_action_editing_dragAndPinchReframe_thumbnailsStillSelect() {
        let edition = ComposerCaptureGestureContext(editing: true)
        XCTAssertEqual(action(.scene, .drag, edition), .reframe)
        XCTAssertEqual(action(.scene, .pinch, edition), .reframe)
        XCTAssertEqual(action(.scene, .doubleTap, edition), .none)
        XCTAssertEqual(action(.otherThumbnail, .tap, edition), .select)
        XCTAssertEqual(action(.chosenThumbnail, .longPress, edition), .none)
    }

    func test_action_viewfinderOff_doesNothing() {
        XCTAssertEqual(action(.scene, .tap, ComposerCaptureGestureContext(stage: .off)), .none)
    }

    // MARK: - Le toucher, lu par la règle du porteur (#9464)

    private let maintenant = Date(timeIntervalSinceReferenceDate: 1_000)

    private func toucher(_ zone: ComposerCaptureZone,
                         _ contexte: ComposerCaptureGestureContext = ComposerCaptureGestureContext(),
                         precedentIlYa: TimeInterval?, armeIlYa: TimeInterval? = 5) -> ComposerCaptureAction {
        ComposerCaptureGesture.tap(zone: zone, context: contexte, now: maintenant,
                                   lastTapAt: precedentIlYa.map { maintenant.addingTimeInterval(-$0) },
                                   armedAt: armeIlYa.map { maintenant.addingTimeInterval(-$0) })
    }

    func test_tap_firstTouchOnTheScene_focusesAtOnce() {
        XCTAssertEqual(toucher(.scene, precedentIlYa: nil), .focus)
        XCTAssertEqual(toucher(.scene, precedentIlYa: 0.5), .focus, "au-delà de la fenêtre, un toucher reste un toucher")
    }

    func test_tap_secondTouchWithinTheWindow_takesThePhoto() {
        XCTAssertEqual(toucher(.scene, precedentIlYa: 0.2), .photoToEdit)
        XCTAssertEqual(toucher(.chosenThumbnail, precedentIlYa: 0.2), .photoToGallery)
    }

    func test_tap_aTouchBeforeTheArming_opensNoDoubleTap() {
        XCTAssertEqual(toucher(.scene, precedentIlYa: 0.2, armeIlYa: 0.1), .focus)
    }

    func test_tap_duringATake_everyTouchFocuses() {
        XCTAssertEqual(toucher(.scene, ComposerCaptureGestureContext(stage: .recording), precedentIlYa: 0.1), .focus)
        XCTAssertEqual(toucher(.chosenThumbnail, ComposerCaptureGestureContext(stage: .recording, locked: true),
                               precedentIlYa: 0.1), .stopTake)
    }

    func test_tap_aRefusedPhoto_fallsBackToFocus() {
        XCTAssertEqual(toucher(.scene, ComposerCaptureGestureContext(pendingSegments: 1), precedentIlYa: 0.2), .focus,
                       "le second toucher qui ne peut pas photographier vise encore")
        XCTAssertEqual(toucher(.scene, ComposerCaptureGestureContext(allowsPhoto: false), precedentIlYa: 0.2), .focus)
    }
}
