import XCTest
import MeeshySDK
@testable import MeeshyUI
@testable import Meeshy

/// **Une prise de la caméra fait UN pas d'annulation** (#17109, loi 9 : « Valider
/// garde et fait UN pas d'annulation »).
///
/// La pose d'une prise écrit deux fois dans le document — le cadrage du fond,
/// puis le média — de part et d'autre d'attentes asynchrones. Si la capture
/// débouncée de l'historique tombe entre les deux, ↶ défait le média et laisse
/// le cadrage : deux pas pour un geste.
@MainActor
final class ComposerCameraUndoStepTests: XCTestCase {

    func test_aShotWrittenInTwoSteps_withACaptureInBetween_isOneUndoStep() throws {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        XCTAssertFalse(vm.canUndoGlobal)

        ComposerSceneHistoryHold.hold(true)
        _ = try XCTUnwrap(vm.addMediaObject(kind: .image))
        vm.pushHistorySnapshot()
        _ = try XCTUnwrap(vm.addMediaObject(kind: .image))
        ComposerSceneHistoryHold.hold(false)
        vm.pushHistorySnapshot()

        XCTAssertTrue(vm.canUndoGlobal)
        XCTAssertTrue(vm.undoGlobal())
        XCTAssertTrue(vm.currentEffects.mediaObjects?.isEmpty ?? true, "↶ défait la prise entière")
        XCTAssertFalse(vm.canUndoGlobal, "et il n'y avait qu'un pas")
    }

    func test_releasingWithoutAHold_changesNothing() {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        ComposerSceneHistoryHold.hold(false)
        XCTAssertFalse(vm.canUndoGlobal)
    }

    func test_theComposer_holdsTheCaptureAcrossTheWholePose() throws {
        let hote = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/MeeshyComposerHost+Viewfinder.swift")
        let tenue = try XCTUnwrap(hote.range(of: "ComposerSceneHistoryHold.around {"))
        let cadrage = try XCTUnwrap(hote.range(of: "applySceneFitMode(cadrage)", range: tenue.upperBound..<hote.endIndex))
        let pose = try XCTUnwrap(hote.range(of: "await ingestCameraCapture(result)", range: tenue.upperBound..<hote.endIndex))
        XCTAssertLessThan(cadrage.lowerBound, pose.lowerBound, "le cadrage et le média sont tenus ensemble")
    }

    func test_around_holdsTheHistory_untilThePoseEnds() async throws {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        let fini = expectation(description: "pose")
        ComposerSceneHistoryHold.around {
            _ = vm.addMediaObject(kind: .image)
            vm.pushHistorySnapshot()
            _ = vm.addMediaObject(kind: .image)
            fini.fulfill()
        }
        await fulfillment(of: [fini], timeout: 2)
        try await Task.sleep(nanoseconds: 50_000_000)
        vm.pushHistorySnapshot()
        XCTAssertTrue(vm.undoGlobal())
        XCTAssertTrue(vm.currentEffects.mediaObjects?.isEmpty ?? true, "↶ défait la prise entière")
        XCTAssertFalse(vm.canUndoGlobal)
    }
}
