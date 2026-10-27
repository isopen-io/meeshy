import AVFoundation
import XCTest
@testable import Meeshy

/// The call audio session's category options and I/O hints (#11522), shared
/// by `configureAudioSession` and CallKit's `didActivate`.
@MainActor
final class CallAudioSessionTuningTests: XCTestCase {

    private let noSystemAlertInterruptions = AVAudioSession.CategoryOptions(rawValue: 0x100)

    func test_categoryOptions_onIPhone_useHFPDuckingAndNoSystemAlertInterruptions() {
        let options = CallAudioSessionTuning.categoryOptions(isiOSAppOnMac: false)
        XCTAssertEqual(options, [.allowBluetoothHFP, .duckOthers, noSystemAlertInterruptions])
    }

    func test_categoryOptions_onMac_skipTheOptionTheMacShimLacks() {
        let options = CallAudioSessionTuning.categoryOptions(isiOSAppOnMac: true)
        XCTAssertEqual(options, [.allowBluetoothHFP, .duckOthers])
    }

    func test_categoryOptions_neverRequestA2DP() {
        for isMac in [false, true] {
            XCTAssertFalse(CallAudioSessionTuning.categoryOptions(isiOSAppOnMac: isMac).contains(.allowBluetoothA2DP))
        }
    }

    func test_bothSites_applyTheSameOpusHints() throws {
        let unit = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager.swift")
        let tuning = try AppSourceGuard.unit("Meeshy/Features/Main/Services/WebRTC/CallAudioSessionTuning.swift")
        XCTAssertTrue(tuning.contains("setPreferredSampleRate(48_000)"))
        XCTAssertTrue(tuning.contains("setPreferredIOBufferDuration(0.02)"))
        XCTAssertTrue(unit.contains("CallAudioSessionTuning.applyCallPreferences(to: session.session)"))
        XCTAssertTrue(unit.contains("CallAudioSessionTuning.applyOpusIOHints(to: audioSession)"))
    }
}
