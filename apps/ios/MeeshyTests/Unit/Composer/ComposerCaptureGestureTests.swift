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
                         precedentIlYa: TimeInterval?, precedentSur zonePrecedente: ComposerCaptureZone? = nil,
                         armeIlYa: TimeInterval? = 5) -> ComposerCaptureTapOutcome {
        ComposerCaptureGesture.tap(zone: zone, context: contexte, now: maintenant,
                                   lastTap: precedentIlYa.map {
                                       ComposerCaptureLastTap(zone: zonePrecedente ?? zone,
                                                              at: maintenant.addingTimeInterval(-$0))
                                   },
                                   armedAt: armeIlYa.map { maintenant.addingTimeInterval(-$0) })
    }

    func test_tap_firstTouchOnTheScene_focusesAtOnce_andIsRemembered() {
        let premier = toucher(.scene, precedentIlYa: nil)
        XCTAssertEqual(premier.action, .focus)
        XCTAssertFalse(premier.consumedDouble)
        XCTAssertEqual(premier.memory, ComposerCaptureLastTap(zone: .scene, at: maintenant))
        XCTAssertEqual(toucher(.scene, precedentIlYa: 0.5).action, .focus, "au-delà de la fenêtre, un toucher reste un toucher")
    }

    func test_tap_secondTouchInTheSameZone_takesThePhoto_andForgetsTheDouble() {
        let double = toucher(.scene, precedentIlYa: 0.2)
        XCTAssertEqual(double.action, .photoToEdit)
        XCTAssertTrue(double.consumedDouble)
        XCTAssertNil(double.memory, "un troisième toucher ouvre un nouveau double")
        XCTAssertEqual(toucher(.chosenThumbnail, precedentIlYa: 0.2, precedentSur: .chosenThumbnail).action,
                       .photoToGallery)
    }

    func test_tap_sceneThenChosenThumbnail_isNeverADouble() {
        let miniature = toucher(.chosenThumbnail, precedentIlYa: 0.2, precedentSur: .scene)
        XCTAssertNotEqual(miniature.action, .photoToGallery, "aucune photo ne part en galerie sans double sur la miniature")
        XCTAssertNotEqual(miniature.action, .photoToEdit)
        XCTAssertFalse(miniature.consumedDouble)
        XCTAssertEqual(miniature.memory, ComposerCaptureLastTap(zone: .chosenThumbnail, at: maintenant))
        XCTAssertEqual(toucher(.scene, precedentIlYa: 0.2, precedentSur: .chosenThumbnail).action, .focus)
    }

    func test_tap_aTouchBeforeTheArming_opensNoDoubleTap() {
        XCTAssertEqual(toucher(.scene, precedentIlYa: 0.2, armeIlYa: 0.1).action, .focus)
    }

    func test_tap_duringATake_everyTouchFocuses() {
        XCTAssertEqual(toucher(.scene, ComposerCaptureGestureContext(stage: .recording), precedentIlYa: 0.1).action, .focus)
        XCTAssertEqual(toucher(.chosenThumbnail, ComposerCaptureGestureContext(stage: .recording, locked: true),
                               precedentIlYa: 0.1).action, .stopTake)
    }

    func test_tap_aRefusedPhoto_fallsBackToFocus() {
        let refusee = toucher(.scene, ComposerCaptureGestureContext(pendingSegments: 1), precedentIlYa: 0.2)
        XCTAssertEqual(refusee.action, .focus, "le second toucher qui ne peut pas photographier vise encore")
        XCTAssertFalse(refusee.consumedDouble)
        XCTAssertEqual(toucher(.scene, ComposerCaptureGestureContext(allowsPhoto: false), precedentIlYa: 0.2).action, .focus)
    }

    func test_tap_pendingSegments_theSessionDecidesLikeTheTable() {
        let session = ComposerCaptureSession(stage: .armed, mode: .video)
        session.segments = [ComposerCaptureSegment(url: URL(fileURLWithPath: "/tmp/segment.mov"), duration: 1)]
        let t0 = Date(timeIntervalSince1970: 2_000)
        XCTAssertEqual(session.tapAction(at: t0), .focus)
        XCTAssertEqual(session.tapAction(at: t0.addingTimeInterval(0.15)), .focus,
                       "une photo jetterait les segments en attente — la session lit la même table")
        let table = ComposerCaptureGesture.tap(zone: .scene, context: session.gestureContext,
                                               now: t0.addingTimeInterval(0.15),
                                               lastTap: ComposerCaptureLastTap(zone: .scene, at: t0), armedAt: nil)
        XCTAssertEqual(table.action, .focus)
    }

    // MARK: - Les équivalents VoiceOver (#9351)

    private func offertes(_ zone: ComposerCaptureZone,
                          _ contexte: ComposerCaptureGestureContext = ComposerCaptureGestureContext()) -> [ComposerCaptureAction] {
        ComposerCaptureGesture.accessibilityActions(zone: zone, context: contexte)
    }

    func test_accessibilityActions_armedScene_photoFilmAndFocus() {
        XCTAssertEqual(offertes(.scene), [.photoToEdit, .filmSegment, .focus])
        XCTAssertEqual(offertes(.scene, ComposerCaptureGestureContext(pendingSegments: 1)), [.filmSegment, .focus],
                       "la table refuse la photo avec des segments : VoiceOver aussi")
        XCTAssertEqual(offertes(.scene, ComposerCaptureGestureContext(allowsVideo: false)), [.photoToEdit, .focus])
    }

    func test_accessibilityActions_recording_offersStop() {
        let enCours = ComposerCaptureGestureContext(stage: .recording)
        XCTAssertEqual(offertes(.scene, enCours), [.stopTake, .focus])
        XCTAssertEqual(offertes(.chosenThumbnail, enCours), [.stopTake])
    }

    func test_accessibilityActions_chosenThumbnail_goesToTheGallery() {
        XCTAssertEqual(offertes(.chosenThumbnail), [.photoToGallery, .filmToGallery])
        XCTAssertEqual(offertes(.chosenThumbnail, ComposerCaptureGestureContext(pendingSegments: 2)), [])
    }

    func test_accessibilityActions_buttonsOffViewfinderAndEditing_offerNothing() {
        XCTAssertEqual(offertes(.rail), [])
        XCTAssertEqual(offertes(.otherThumbnail), [])
        XCTAssertEqual(offertes(.scene, ComposerCaptureGestureContext(stage: .off)), [])
        XCTAssertEqual(offertes(.scene, ComposerCaptureGestureContext(editing: true)), [])
    }

    func test_accessibilityName_everyOfferedActionIsNamed_andNamesAreDistinct() {
        let offertesPartout: [ComposerCaptureAction] = [.photoToEdit, .filmSegment, .stopTake, .focus,
                                                         .photoToGallery, .filmToGallery]
        let noms = offertesPartout.compactMap(ComposerCaptureGesture.accessibilityName(of:))
        XCTAssertEqual(noms.count, offertesPartout.count)
        XCTAssertEqual(Set(noms).count, noms.count)
        XCTAssertFalse(noms.contains { $0.hasPrefix("composer.capture.a11y.") }, "chaque nom est au catalogue")
        XCTAssertNil(ComposerCaptureGesture.accessibilityName(of: .zoom))
    }

    // MARK: - Cas de bord de la table

    func test_action_edgeCases_railWithSegments_offAndDragWithoutHold() {
        XCTAssertEqual(action(.rail, .tap, ComposerCaptureGestureContext(pendingSegments: 1)), .none)
        XCTAssertEqual(action(.otherThumbnail, .tap, ComposerCaptureGestureContext(stage: .off)), .none)
        XCTAssertEqual(action(.rail, .tap, ComposerCaptureGestureContext(stage: .off)), .none)
        XCTAssertEqual(action(.chosenThumbnail, .drag), .none)
    }
}
