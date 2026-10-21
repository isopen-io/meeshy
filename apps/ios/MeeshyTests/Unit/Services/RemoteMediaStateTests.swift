import XCTest
@testable import Meeshy

final class RemoteMediaStateTests: XCTestCase {
    private let degradedAndCapturing = RemoteMediaState(
        isVideoEnabled: false,
        isAudioEnabled: false,
        isScreenCapturing: true,
        isQualityDegraded: true
    )

    func test_initial_assumesPeerCameraAndMicOn_noCapture_noDegradation() {
        let state = RemoteMediaState.initial

        XCTAssertTrue(state.isVideoEnabled)
        XCTAssertTrue(state.isAudioEnabled)
        XCTAssertFalse(state.isScreenCapturing)
        XCTAssertFalse(state.isQualityDegraded)
    }

    func test_applying_eachChange_touchesOnlyItsField() {
        let video = RemoteMediaState.initial.applying(.video(false))
        XCTAssertEqual(video, RemoteMediaState(isVideoEnabled: false, isAudioEnabled: true,
                                               isScreenCapturing: false, isQualityDegraded: false))

        let audio = RemoteMediaState.initial.applying(.audio(false))
        XCTAssertEqual(audio, RemoteMediaState(isVideoEnabled: true, isAudioEnabled: false,
                                               isScreenCapturing: false, isQualityDegraded: false))

        let capture = RemoteMediaState.initial.applying(.screenCapture(true))
        XCTAssertEqual(capture, RemoteMediaState(isVideoEnabled: true, isAudioEnabled: true,
                                                 isScreenCapturing: true, isQualityDegraded: false))

        let quality = RemoteMediaState.initial.applying(.qualityDegraded(true))
        XCTAssertEqual(quality, RemoteMediaState(isVideoEnabled: true, isAudioEnabled: true,
                                                 isScreenCapturing: false, isQualityDegraded: true))
    }

    func test_applying_eachChange_leavesTheOtherFieldsOfADirtyStateUntouched() {
        let video = degradedAndCapturing.applying(.video(true))
        XCTAssertEqual(video, RemoteMediaState(isVideoEnabled: true, isAudioEnabled: false,
                                               isScreenCapturing: true, isQualityDegraded: true))

        let quality = degradedAndCapturing.applying(.qualityDegraded(false))
        XCTAssertEqual(quality, RemoteMediaState(isVideoEnabled: false, isAudioEnabled: false,
                                                 isScreenCapturing: true, isQualityDegraded: false))
    }

    func test_applying_sameValue_yieldsEqualState() {
        XCTAssertEqual(degradedAndCapturing.applying(.video(false)), degradedAndCapturing)
        XCTAssertEqual(degradedAndCapturing.applying(.audio(false)), degradedAndCapturing)
        XCTAssertEqual(degradedAndCapturing.applying(.screenCapture(true)), degradedAndCapturing)
        XCTAssertEqual(degradedAndCapturing.applying(.qualityDegraded(true)), degradedAndCapturing)
    }

    @MainActor
    func test_resetEndedStateForNewCall_resetsRemoteMediaToInitial() {
        let manager = CallManager.shared
        manager.callState = .ended(reason: .remote)
        manager.remoteMedia = degradedAndCapturing

        manager.resetEndedStateForNewCall()

        XCTAssertEqual(manager.remoteMedia, .initial)
        manager.callState = .idle
    }

    @MainActor
    func test_remoteFlags_projectRemoteMedia() {
        let manager = CallManager.shared
        manager.remoteMedia = degradedAndCapturing

        XCTAssertFalse(manager.isRemoteVideoEnabled)
        XCTAssertFalse(manager.isRemoteAudioEnabled)
        XCTAssertTrue(manager.isRemoteScreenCapturing)
        XCTAssertTrue(manager.isRemoteQualityDegraded)
        manager.remoteMedia = .initial
    }
}
