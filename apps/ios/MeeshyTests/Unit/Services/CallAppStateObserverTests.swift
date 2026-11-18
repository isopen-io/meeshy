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

    /// #19695 — le retour au premier plan réaffirme « pas de veille » tant que l'appel vit : posé en
    /// arrière-plan (décroché depuis l'écran verrouillé), le drapeau ne tenait pas.
    func test_foreground_reassertsTheIdleTimer_forALiveCall() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallCollaborators/CallAppStateObserver.swift"))
        let foreground = try XCTUnwrap(source.range(of: "UIApplication.willEnterForegroundNotification"))
        XCTAssertTrue(source[foreground.upperBound...].prefix(600).contains("UIApplication.shared.isIdleTimerDisabled = call.callState.isActive"))
        let manager = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallManager.swift"))
        XCTAssertTrue(manager.contains("UIApplication.shared.isIdleTimerDisabled = active"), "le changement d'état pose toujours le drapeau")
    }
}
