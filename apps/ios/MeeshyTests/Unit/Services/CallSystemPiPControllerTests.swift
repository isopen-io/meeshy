import XCTest
import UIKit
@testable import Meeshy

/// `CallSystemPiPController` porte le PiP système de l'appel (#11522) : la
/// fabrique AVKit n'est jamais appelée à la construction (#7955), les commandes
/// du bouton passent au contrôleur, et les paliers thermiques fixent la cadence.
@MainActor
final class CallSystemPiPControllerTests: XCTestCase {

    @MainActor
    private final class MockPiPController: PiPCallProviding {
        nonisolated deinit {}
        var isPiPSupported = true
        var isPiPActive = false
        private(set) var startCount = 0
        private(set) var stopCount = 0
        private(set) var tearDownCount = 0
        func configure(sourceView: UIView, remoteTrack: AnyObject, autoStart: Bool,
                       onStart: @escaping @MainActor () -> Void,
                       onRestoreUI: @escaping @MainActor () -> Void,
                       onStop: @escaping @MainActor () -> Void) {}
        func updateRemoteTrack(_ remoteTrack: AnyObject) {}
        func setMaxFrameRate(_ fps: Int) {}
        func setRemoteVideoMuted(_ muted: Bool) {}
        func start() { startCount += 1 }
        func stop() { stopCount += 1 }
        func tearDown() { tearDownCount += 1 }
    }

    private final class FactoryCounter {
        var builds = 0
    }

    private func makeSUT() -> (CallSystemPiPController, MockPiPController, FactoryCounter) {
        let mock = MockPiPController()
        let counter = FactoryCounter()
        let controller = CallSystemPiPController(makePip: {
            counter.builds += 1
            return mock
        })
        return (controller, mock, counter)
    }

    func test_building_doesNotBuildTheAVKitController() {
        let (_, _, counter) = makeSUT()

        XCTAssertEqual(counter.builds, 0)
    }

    func test_startingManually_setsTheManualOrigin_andStartsOnce() {
        let (controller, mock, counter) = makeSUT()

        controller.startSystemPiP()

        XCTAssertEqual(controller.pipStartOrigin, .manual)
        XCTAssertEqual(mock.startCount, 1)
        XCTAssertEqual(counter.builds, 1)
    }

    func test_stopping_stopsOnce() {
        let (controller, mock, _) = makeSUT()

        controller.stopSystemPiP()

        XCTAssertEqual(mock.stopCount, 1)
    }

    func test_detaching_tearsDownAndResetsTheOrigin() {
        let (controller, mock, _) = makeSUT()
        controller.startSystemPiP()

        controller.detachSystemPiP()

        XCTAssertEqual(mock.tearDownCount, 1)
        XCTAssertEqual(controller.pipStartOrigin, .automatic)
        XCTAssertNil(controller.pipDisplayModeAtStart)
    }

    func test_pipFrameRate_followsTheThermalLadder() {
        let (controller, _, _) = makeSUT()

        XCTAssertEqual(controller.pipFrameRate(for: .critical), QualityThresholds.pipFrameRateCritical)
        XCTAssertEqual(controller.pipFrameRate(for: .serious), QualityThresholds.pipFrameRateSerious)
        XCTAssertEqual(controller.pipFrameRate(for: .nominal), QualityThresholds.pipFrameRateDefault)
    }

    func test_stopWithoutStart_restoresNoDisplayMode() {
        let (controller, _, _) = makeSUT()

        controller.systemPiPDidStop()

        XCTAssertNil(controller.pipDisplayModeAtStart)
        XCTAssertFalse(controller.pipRestoring)
    }

    func test_withoutAnAttachedCall_thePipCannotBeActivated() {
        let (controller, _, _) = makeSUT()

        XCTAssertFalse(controller.canActivateSystemPiP)
    }
}
