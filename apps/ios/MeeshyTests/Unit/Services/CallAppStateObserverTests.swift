import XCTest
@testable import Meeshy

/// `CallAppStateObserver` possède les observateurs de capture d'écran,
/// d'arrière-plan et de premier plan d'un appel (#11522) : chaque démarrage est
/// idempotent, chaque arrêt les retire.
@MainActor
final class CallAppStateObserverTests: XCTestCase {

    func test_screenCaptureMonitoring_startsAndStops() {
        let observer = CallAppStateObserver()
        observer.startScreenCaptureMonitoring()
        observer.startScreenCaptureMonitoring()
        XCTAssertTrue(observer.isObservingScreenCapture)
        observer.stopScreenCaptureMonitoring()
        XCTAssertFalse(observer.isObservingScreenCapture)
    }

    func test_backgroundMonitoring_startsAndStopsBothObservers() {
        let observer = CallAppStateObserver()
        observer.startBackgroundMonitoring()
        observer.startBackgroundMonitoring()
        XCTAssertTrue(observer.isObservingBackground)
        observer.stopBackgroundMonitoring()
        XCTAssertFalse(observer.isObservingBackground)
    }

}
