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

    func test_theBar_hasFiveSlots_filledLeftToRight() {
        XCTAssertEqual(ComposerCaptureRecordingBudget.slots, 5)
        let fills = ComposerCaptureRecordingBudget.slotFills(elapsed: 30, budget: 60)
        XCTAssertEqual(fills.count, 5)
        XCTAssertEqual(fills[0], 1, accuracy: 0.0001)
        XCTAssertEqual(fills[1], 1, accuracy: 0.0001)
        XCTAssertEqual(fills[2], 0.5, accuracy: 0.0001, "la case en cours se remplit à moitié")
        XCTAssertEqual(fills[3], 0, accuracy: 0.0001)
        XCTAssertEqual(fills[4], 0, accuracy: 0.0001)
    }

    func test_theBar_isEmptyWithoutABudget_andNeverOverflows() {
        XCTAssertEqual(ComposerCaptureRecordingBudget.slotFills(elapsed: 12, budget: nil), [0, 0, 0, 0, 0])
        XCTAssertEqual(ComposerCaptureRecordingBudget.slotFills(elapsed: 500, budget: 60), [1, 1, 1, 1, 1])
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
