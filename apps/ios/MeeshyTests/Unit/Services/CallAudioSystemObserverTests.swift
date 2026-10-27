import XCTest
import AVFoundation
@testable import Meeshy

/// `CallAudioSystemObserver` possède les trois observateurs audio du système
/// (#11522) : il les pose une seule fois, et hors appel une notification ne
/// touche à rien.
@MainActor
final class CallAudioSystemObserverTests: XCTestCase {

    private func settleMainActor() async {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
        await Task.yield()
    }

    func test_start_registersTheThreeObservers_once() {
        let observer = CallAudioSystemObserver()
        observer.start(observing: CallManager.shared)
        observer.start(observing: CallManager.shared)
        XCTAssertEqual(observer.observerCount, 3)
    }

    func test_routeChangeOutsideACall_leavesTheSpeakerUntouched() async throws {
        let call = CallManager.shared
        try XCTSkipIf(call.callState.isActive, "requires an idle call manager")
        let saved = call.isSpeaker
        defer { call.isSpeaker = saved }
        call.isSpeaker = true
        let observer = CallAudioSystemObserver()
        observer.start(observing: call)
        NotificationCenter.default.post(
            name: AVAudioSession.routeChangeNotification,
            object: nil,
            userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.newDeviceAvailable.rawValue]
        )
        await settleMainActor()
        XCTAssertTrue(call.isSpeaker)
    }
}
