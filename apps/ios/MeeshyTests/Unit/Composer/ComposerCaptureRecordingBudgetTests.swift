import XCTest
@testable import Meeshy

/// **Filmer a une durée maximale par format, dite par une barre en cases et par
/// l'anneau rouge du déclencheur** (vue A9, #17109).
@MainActor
final class ComposerCaptureRecordingBudgetTests: XCTestCase {

    func test_eachFormatThatFilms_hasAMaximum_andTheStatusHasNone() {
        XCTAssertEqual(ComposerCaptureRecordingBudget.maxDuration(for: .story), 60)
        XCTAssertEqual(ComposerCaptureRecordingBudget.maxDuration(for: .post), 60)
        XCTAssertEqual(ComposerCaptureRecordingBudget.maxDuration(for: .reel), 90)
        XCTAssertNil(ComposerCaptureRecordingBudget.maxDuration(for: .status))
    }

    func test_theBar_hasFiveSlots_andItsFractionIsBounded() {
        XCTAssertEqual(ComposerCaptureRecordingBudget.slots, 5)
        XCTAssertEqual(ComposerCaptureRecordingBudget.fraction(elapsed: 30, budget: 60), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerCaptureRecordingBudget.fraction(elapsed: 12, budget: nil), 0)
        XCTAssertEqual(ComposerCaptureRecordingBudget.fraction(elapsed: 500, budget: 60), 1)
        XCTAssertEqual(ComposerCaptureRecordingBudget.fraction(elapsed: -3, budget: 60), 0)
    }

    func test_theLimit_isReachedAtTheMaximum_neverWithoutOne() {
        XCTAssertFalse(ComposerCaptureRecordingBudget.reached(elapsed: 59.9, budget: 60))
        XCTAssertTrue(ComposerCaptureRecordingBudget.reached(elapsed: 60, budget: 60))
        XCTAssertFalse(ComposerCaptureRecordingBudget.reached(elapsed: 3600, budget: nil))
    }

    // MARK: - La machine clôt la prise à la limite

    func test_aTakeAtTheLimit_closesItself_andAReleaseAfterwardTakesNothing() {
        let session = ComposerCaptureSession()
        session.recordingBudget = 60
        session.stage = .recording
        session.holdStartedAt = Date()
        session.holdPhase = .holding

        XCTAssertTrue(ComposerCaptureRecordingBudget.enforce(on: session, elapsed: 60))

        XCTAssertEqual(session.stage, .armed, "la prise se clôt d'elle-même")
        XCTAssertNil(session.holdStartedAt, "la levée du doigt qui suivra ne clôt plus rien")
        XCTAssertNil(session.holdPhase)
    }

    func test_belowTheLimit_orWithoutABudget_theTakeKeepsRunning() {
        let session = ComposerCaptureSession()
        session.stage = .recording
        session.recordingBudget = 60
        XCTAssertFalse(ComposerCaptureRecordingBudget.enforce(on: session, elapsed: 12))
        session.recordingBudget = nil
        XCTAssertFalse(ComposerCaptureRecordingBudget.enforce(on: session, elapsed: 3600))
        XCTAssertEqual(session.stage, .recording)
    }

    func test_anExhaustedBudget_refusesAnotherTake_ratherThanAnEmptySegment() {
        XCTAssertTrue(ComposerCaptureRecordingBudget.allowsAnotherTake(taken: 59, budget: 60))
        XCTAssertFalse(ComposerCaptureRecordingBudget.allowsAnotherTake(taken: 60, budget: 60))
        XCTAssertTrue(ComposerCaptureRecordingBudget.allowsAnotherTake(taken: 3600, budget: nil))

        let session = ComposerCaptureSession()
        session.stage = .armed
        session.recordingBudget = 60
        session.segments = [ComposerCaptureSegment(url: URL(fileURLWithPath: "/tmp/segment_\(UUID().uuidString).mov"),
                                                   duration: 60)]
        session.startFilming()
        XCTAssertEqual(session.stage, .armed, "le maximum est atteint : aucune prise ne repart")
    }

    func test_outsideATake_theBudgetDoesNothing() {
        let session = ComposerCaptureSession()
        session.stage = .armed
        session.recordingBudget = 60
        XCTAssertFalse(ComposerCaptureRecordingBudget.enforce(on: session, elapsed: 90))
        XCTAssertEqual(session.stage, .armed)
    }

    func test_theComposer_armsWithTheBudgetOfItsFormat_andFullScreen() throws {
        let hote = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/MeeshyComposerHost+Viewfinder.swift")
        XCTAssertTrue(hote.contains("sceneCapture.recordingBudget = ComposerCaptureRecordingBudget.maxDuration(for: selectedFormat)"))
        XCTAssertTrue(hote.contains("sceneCameraSize = .armed"), "la caméra s'arme plein écran (A8)")
        XCTAssertFalse(hote.contains("sceneCameraSize = .card"), "plus de carte à l'armement")
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerCaptureRecordingBudget.enforce(on: session"), "le chrome fait respecter la limite")
    }
}

/// **Les segments paraissent en haut et l'anneau tourne dès que la tenue
/// commence** (#17268, retour porteur du 2026-11-09).
@MainActor
final class ComposerCaptureProgressDisplayTests: XCTestCase {

    // MARK: - La prise est à l'écran dès la tenue

    func test_isCapturing_holdBeforeTheCameraWrites_isTrue() {
        XCTAssertTrue(ComposerCaptureProgressDisplay.isCapturing(stage: .armed, holding: true),
                      "la tenue part avant que la session écrive : la barre et l'anneau aussi")
    }

    func test_isCapturing_recordingLockedWithoutFinger_isTrue() {
        XCTAssertTrue(ComposerCaptureProgressDisplay.isCapturing(stage: .recording, holding: false))
    }

    func test_isCapturing_armedWithoutHold_isFalse() {
        XCTAssertFalse(ComposerCaptureProgressDisplay.isCapturing(stage: .armed, holding: false))
        XCTAssertFalse(ComposerCaptureProgressDisplay.isCapturing(stage: .off, holding: true))
    }

    func test_liveDuration_outsideRecording_isZero() {
        XCTAssertEqual(ComposerCaptureProgressDisplay.liveDuration(7, stage: .armed), 0,
                       "la caméra garde la durée de la prise close : la tenue suivante ne la reprend pas")
        XCTAssertEqual(ComposerCaptureProgressDisplay.liveDuration(7, stage: .recording), 7)
        XCTAssertEqual(ComposerCaptureProgressDisplay.liveDuration(-1, stage: .recording), 0)
    }

    // MARK: - La barre paraît dès le début de la prise

    func test_showsBudgetBar_fromTheFirstHold_evenWithoutSegment() {
        XCTAssertTrue(ComposerCaptureProgressDisplay.showsBudgetBar(editing: false, budget: 60,
                                                                    capturing: true, segmentCount: 0))
    }

    func test_showsBudgetBar_withPendingSegments_stays() {
        XCTAssertTrue(ComposerCaptureProgressDisplay.showsBudgetBar(editing: false, budget: 60,
                                                                    capturing: false, segmentCount: 2))
    }

    func test_showsBudgetBar_idleEditingOrWithoutBudget_isHidden() {
        XCTAssertFalse(ComposerCaptureProgressDisplay.showsBudgetBar(editing: false, budget: 60,
                                                                     capturing: false, segmentCount: 0))
        XCTAssertFalse(ComposerCaptureProgressDisplay.showsBudgetBar(editing: true, budget: 60,
                                                                     capturing: true, segmentCount: 1))
        XCTAssertFalse(ComposerCaptureProgressDisplay.showsBudgetBar(editing: false, budget: nil,
                                                                     capturing: true, segmentCount: 1))
        XCTAssertFalse(ComposerCaptureProgressDisplay.showsBudgetBar(editing: false, budget: 0,
                                                                     capturing: true, segmentCount: 1))
    }

    // MARK: - Une capsule par segment, la prise en cours en dernier

    func test_spans_oneCapsulePerSegment_placedAtItsShareOfTheBudget() {
        let parts = ComposerCaptureProgressDisplay.spans(segments: [6, 12], live: 0, capturing: false, budget: 60)
        XCTAssertEqual(parts.count, 2)
        XCTAssertEqual(parts[0].start, 0, accuracy: 0.0001)
        XCTAssertEqual(parts[0].length, 0.1, accuracy: 0.0001)
        XCTAssertEqual(parts[1].start, 0.1, accuracy: 0.0001)
        XCTAssertEqual(parts[1].length, 0.2, accuracy: 0.0001)
        XCTAssertFalse(parts.contains { $0.live }, "sans prise en cours, aucune capsule rouge")
    }

    func test_spans_whileCapturing_appendsTheLiveTakeAfterTheSegments() {
        let parts = ComposerCaptureProgressDisplay.spans(segments: [6], live: 3, capturing: true, budget: 60)
        XCTAssertEqual(parts.count, 2)
        XCTAssertEqual(parts[1].start, 0.1, accuracy: 0.0001)
        XCTAssertEqual(parts[1].length, 0.05, accuracy: 0.0001)
        XCTAssertTrue(parts[1].live, "la prise en cours se distingue des segments clos")
    }

    func test_spans_holdJustStarted_showsAnEmptyLiveSpan() {
        let parts = ComposerCaptureProgressDisplay.spans(segments: [], live: 0, capturing: true, budget: 60)
        XCTAssertEqual(parts, [ComposerCaptureBarSpan(start: 0, length: 0, live: true)],
                       "la prise paraît dès la tenue, avant sa première seconde")
    }

    func test_spans_neverOverflowTheBudget() {
        let parts = ComposerCaptureProgressDisplay.spans(segments: [50], live: 30, capturing: true, budget: 60)
        let fin = parts.last.map { $0.start + $0.length } ?? 0
        XCTAssertEqual(fin, 1, accuracy: 0.0001)
    }

    func test_spans_withoutBudget_isEmpty() {
        XCTAssertTrue(ComposerCaptureProgressDisplay.spans(segments: [6], live: 3, capturing: true, budget: nil).isEmpty)
    }

    // MARK: - L'anneau

    func test_ringProgress_countsSegmentsAndTheLiveTake() {
        let segment = ComposerCaptureSegment(url: URL(fileURLWithPath: "/tmp/a.mov"), duration: 15)
        XCTAssertEqual(ComposerCaptureProgressDisplay.ringProgress(segments: [segment], rawLive: 15,
                                                                   stage: .recording, budget: 60), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerCaptureProgressDisplay.ringProgress(segments: [segment], rawLive: 15,
                                                                   stage: .armed, budget: 60), 0.25, accuracy: 0.0001,
                       "hors enregistrement, la durée gardée par la caméra ne compte pas deux fois")
    }

    // MARK: - Le câblage

    func test_topBar_readsTheDisplayRule_andDrawsTheSegments() throws {
        let barre = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("ComposerCaptureProgressDisplay.showsBudgetBar("))
        XCTAssertTrue(barre.contains("ComposerCaptureProgressDisplay.spans("))
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("holding: session.barCapture.holding"), "la barre sait que la tenue a commencé")
    }

    func test_everyTrigger_carriesTheRecordingProgress() throws {
        let bande = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains("ComposerCaptureProgressDisplay.ringProgress("), "l'anneau du déclencheur simple")
        XCTAssertTrue(bande.contains(".environment(\\.composerCaptureProgress"),
                      "la miniature choisie, seule ou dans la bande ouverte, porte la progression")
        let cadre = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerTriggerOutline.swift")
        XCTAssertTrue(cadre.contains(".trim(from: 0, to:"), "le cadre de la miniature se remplit comme l'anneau")
    }
}
