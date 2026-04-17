#if os(iOS)
import XCTest
import AVFoundation
import Combine
@testable import MeeshySDK

final class MediaSessionCoordinatorTests: XCTestCase {

    private var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        cancellables = []
    }

    override func tearDown() {
        cancellables = nil
        super.tearDown()
    }

    /// Simulate an AVAudioSession interruption began / ended cycle and make
    /// sure subscribers receive the corresponding events. This guards
    /// against future regressions where the actor swallows the system
    /// notification (e.g. dropped observer registration).
    func test_interruptionBegan_isRepublishedOnEventsSubject() async {
        let coordinator = MediaSessionCoordinator.shared
        // Trigger observer installation by requesting a session role. The
        // request itself may throw in CI environments without audio but
        // we still want the side effect of registering observers.
        _ = try? await coordinator.request(role: .playback)
        // Release immediately so we don't hold an activation count across tests.
        await coordinator.release()

        let expectation = expectation(description: "interruption began received")
        coordinator.events
            .filter { $0 == .interruptionBegan }
            .sink { _ in expectation.fulfill() }
            .store(in: &cancellables)

        NotificationCenter.default.post(
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            userInfo: [
                AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue
            ]
        )

        await fulfillment(of: [expectation], timeout: 1.0)
    }

    func test_routeChangeOldDeviceUnavailable_isRepublished() async {
        let coordinator = MediaSessionCoordinator.shared
        _ = try? await coordinator.request(role: .playback)
        await coordinator.release()

        let expectation = expectation(description: "route old device unavailable")
        coordinator.events
            .filter { $0 == .routeChangedOldDeviceUnavailable }
            .sink { _ in expectation.fulfill() }
            .store(in: &cancellables)

        NotificationCenter.default.post(
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            userInfo: [
                AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue
            ]
        )

        await fulfillment(of: [expectation], timeout: 1.0)
    }

    func test_deactivateForBackground_doesNotThrow() async {
        let coordinator = MediaSessionCoordinator.shared
        await coordinator.deactivateForBackground()
        // Calling it twice is also safe.
        await coordinator.deactivateForBackground()
    }
}
#endif
