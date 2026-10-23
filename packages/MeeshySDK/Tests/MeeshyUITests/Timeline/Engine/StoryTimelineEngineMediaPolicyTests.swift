import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// #11984 — la composition locale de la timeline suit la politique média
/// vivante comme les lecteurs de lecture : son tampon d'avance est celui de la
/// politique, et il change quand l'appareil chauffe en cours de lecture.
@MainActor
final class StoryTimelineEngineMediaPolicyTests: XCTestCase {

    @MainActor
    private final class DeviceState {
        var thermal: ProcessInfo.ThermalState = .nominal

        var policy: MediaPolicy {
            MediaPolicy(thermalState: thermal, lowPower: false, tier: .high)
        }
    }

    func test_compositionItem_takesTheLivePolicyBuffer() {
        let device = DeviceState()
        let monitor = MediaPolicyMonitor(read: { device.policy })

        let item = StoryTimelineEngine.makeCompositionItem(asset: AVMutableComposition(), monitor: monitor)

        XCTAssertEqual(item.preferredForwardBufferDuration, device.policy.forwardBufferDuration(for: .watched), accuracy: 0.0001)
    }

    func test_compositionItem_followsTheHeat_whileItPlays() {
        let device = DeviceState()
        let monitor = MediaPolicyMonitor(read: { device.policy })
        let item = StoryTimelineEngine.makeCompositionItem(asset: AVMutableComposition(), monitor: monitor)
        let nominal = item.preferredForwardBufferDuration

        device.thermal = .serious
        monitor.refresh()

        XCTAssertEqual(item.preferredForwardBufferDuration, device.policy.forwardBufferDuration(for: .watched), accuracy: 0.0001)
        XCTAssertLessThan(item.preferredForwardBufferDuration, nominal, "un appareil qui chauffe réduit l'avance de la timeline aussi")
    }
}
