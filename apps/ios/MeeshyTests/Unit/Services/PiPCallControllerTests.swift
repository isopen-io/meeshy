//
//  PiPCallControllerTests.swift
//  MeeshyTests
//
//  Tests for PiPCallProviding and NoOpPiPController (WebRTC-free, always compiled)
//  plus source-level constraints for PiPCallController (tearDown, renderer lifecycle,
//  protocol placement guard).
//

import XCTest
import UIKit
@testable import Meeshy

// MARK: - NoOpPiPController (always compiled)

@MainActor
final class PiPCallControllerTests: XCTestCase {

    private func makeSUT() -> NoOpPiPController { NoOpPiPController() }

    // MARK: Properties

    func test_noOp_isPiPSupported_isFalse() {
        XCTAssertFalse(makeSUT().isPiPSupported)
    }

    func test_noOp_isPiPActive_isFalse() {
        XCTAssertFalse(makeSUT().isPiPActive)
    }

    // MARK: All methods are safe no-ops

    func test_noOp_configure_doesNotCrash_andNeverFiresCallbacks() {
        var startFired = false
        var restoreFired = false
        var stopFired = false
        makeSUT().configure(
            sourceView: UIView(),
            remoteTrack: NSObject(),
            autoStart: false,
            onStart: { startFired = true },
            onRestoreUI: { restoreFired = true },
            onStop: { stopFired = true }
        )
        XCTAssertFalse(startFired, "NoOp configure must not fire onStart")
        XCTAssertFalse(restoreFired, "NoOp configure must not fire onRestoreUI")
        XCTAssertFalse(stopFired, "NoOp configure must not fire onStop")
    }

    func test_noOp_start_doesNotCrash() {
        makeSUT().start()
    }

    func test_noOp_stop_doesNotCrash() {
        makeSUT().stop()
    }

    func test_noOp_tearDown_doesNotCrash() {
        makeSUT().tearDown()
    }

    func test_noOp_setMaxFrameRate_doesNotCrash() {
        makeSUT().setMaxFrameRate(30)
    }

    func test_noOp_updateRemoteTrack_doesNotCrash() {
        makeSUT().updateRemoteTrack(NSObject())
    }

    func test_noOp_setRemoteVideoMuted_doesNotCrash() {
        let sut = makeSUT()
        sut.setRemoteVideoMuted(true)
        sut.setRemoteVideoMuted(false)
    }

    // MARK: Protocol idempotency

    func test_noOp_repeatedStartStop_doesNotCrash() {
        let sut = makeSUT()
        sut.start(); sut.start()
        sut.stop();  sut.stop()
        sut.tearDown(); sut.tearDown()
    }
}

// MARK: - Source-level constraints for PiPCallController

@MainActor
final class PiPCallControllerSourceTests: XCTestCase {

    private static let source: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/PiPCallController.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    // MARK: - Protocol is WebRTC-free

    func test_protocol_declaredBeforeWebRTCGuard() {
        XCTAssertFalse(Self.source.isEmpty, "Could not read PiPCallController.swift")
        let protocolRange = Self.source.range(of: "protocol PiPCallProviding")
        let guardRange = Self.source.range(of: "#if canImport(WebRTC)")
        XCTAssertNotNil(protocolRange, "PiPCallProviding protocol must be declared in the file")
        XCTAssertNotNil(guardRange, "#if canImport(WebRTC) guard must be present for the implementation")
        if let p = protocolRange, let g = guardRange {
            XCTAssertLessThan(
                p.lowerBound, g.lowerBound,
                "PiPCallProviding must be declared BEFORE #if canImport(WebRTC) so CallManager compiles without the WebRTC framework"
            )
        }
    }

    // MARK: - tearDown safety

    func test_tearDown_stopsActivePiPBeforeRelease() {
        XCTAssertTrue(
            Self.source.contains("stopPictureInPicture"),
            "tearDown must call stopPictureInPicture so the floating PiP window doesn't become orphaned when the call ends"
        )
        XCTAssertTrue(
            Self.source.contains("isPictureInPictureActive"),
            "tearDown must guard on isPictureInPictureActive to avoid calling stop on an inactive controller"
        )
    }

    // MARK: - Renderer attach lifecycle

    func test_attachRenderer_calledInWillStart() {
        XCTAssertTrue(
            Self.source.contains("func pictureInPictureControllerWillStartPictureInPicture"),
            "WillStart delegate method must be implemented — this is where the renderer attaches (before the PiP window appears)"
        )
        // Structural check: attachRenderer() must appear somewhere after WillStart declaration
        let willStartIdx = Self.source.range(of: "pictureInPictureControllerWillStartPictureInPicture")!.lowerBound
        let attachIdx = Self.source.range(of: "attachRenderer()")!.lowerBound
        XCTAssertGreaterThan(
            attachIdx, willStartIdx,
            "attachRenderer() must appear after the willStart declaration (i.e. inside its body)"
        )
    }

    func test_detachRenderer_calledInDidStop() {
        XCTAssertTrue(
            Self.source.contains("func pictureInPictureControllerDidStopPictureInPicture"),
            "DidStop delegate must be implemented — detaching here stops the CPU decode path when PiP closes"
        )
        XCTAssertTrue(
            Self.source.contains("detachRenderer()"),
            "detachRenderer() must be called in the delegate (didStop + failedToStart) to stop decode"
        )
    }

    func test_detachRenderer_calledInFailedToStart() {
        XCTAssertTrue(
            Self.source.contains("failedToStartPictureInPictureWithError"),
            "failedToStart delegate must be implemented — PiP start can fail; the renderer must be detached to avoid a dangling decode path"
        )
    }

    // MARK: - Renderer idempotency

    func test_attachRenderer_isIdempotent() {
        XCTAssertTrue(
            Self.source.contains("guard renderer == nil"),
            "attachRenderer must guard renderer == nil to prevent double-attaching (which would decode frames twice)"
        )
    }

    // MARK: - configure guard

    func test_configure_guardsPiPSupported() {
        XCTAssertTrue(
            Self.source.contains("guard isPiPSupported"),
            "configure must guard isPiPSupported before building AVPictureInPictureController (saves resources on unsupported devices and Mac Catalyst)"
        )
    }

    // MARK: - Surface flush on detach

    func test_detachRenderer_flushesLayerToReleaseSampleBuffers() {
        XCTAssertTrue(
            Self.source.contains("flushSurface()"),
            "detachRenderer must call flushSurface() to release retained CMSampleBuffers in the persistent display layer"
        )
    }

    // MARK: - updateRemoteTrack identity check

    func test_updateRemoteTrack_usesIdentityCheckToAvoidReattach() {
        XCTAssertTrue(
            Self.source.contains("newTrack !== self.remoteTrack"),
            "updateRemoteTrack must use !== identity comparison to skip re-attachment when the track object hasn't changed"
        )
    }

    // MARK: - autoStart plumbing

    func test_configure_forwardsAutoStartToController() {
        XCTAssertTrue(
            Self.source.contains("canStartPictureInPictureAutomaticallyFromInline"),
            "configure must forward autoStart to canStartPictureInPictureAutomaticallyFromInline so the system manages automatic PiP entry"
        )
    }

    // MARK: - Frame-rate reset on tearDown

    func test_tearDown_resetsDesiredFrameRate() {
        // `PiPCallController` is a singleton (`static let shared`) reused across
        // calls. Without resetting `desiredFrameRate` in tearDown, a thermally
        // throttled fps set via `setMaxFrameRate` during one call would silently
        // carry over as the starting fps of the NEXT call's PiP.
        // "func tearDown() {\n" (multi-line body) uniquely matches the real
        // `PiPCallController` implementation — the protocol requirement has no
        // body at all, and `NoOpPiPController`'s is a same-line `{}`.
        let teardownRange = Self.source.range(of: "func tearDown() {\n")
        XCTAssertNotNil(teardownRange, "PiPCallController.tearDown() implementation must be present")
        guard let teardownStart = teardownRange?.lowerBound,
              let bodyEnd = Self.source.range(of: "\n    }", range: teardownStart..<Self.source.endIndex) else {
            return XCTFail("Could not locate tearDown() body")
        }
        let body = Self.source[teardownStart..<bodyEnd.lowerBound]
        XCTAssertTrue(
            body.contains("desiredFrameRate = QualityThresholds.pipFrameRateDefault"),
            "tearDown() must reset desiredFrameRate to the default so the next call's PiP doesn't inherit a throttled fps from a previous call"
        )
    }

    // MARK: - Remote video mute → placeholder (never the frozen last frame)

    func test_setRemoteVideoMuted_forwardsToRendererAndPersistsState() {
        XCTAssertTrue(
            Self.source.contains("func setRemoteVideoMuted(_ muted: Bool) {\n        isRemoteVideoMuted = muted\n        renderer?.setRemoteVideoMuted(muted)"),
            "setRemoteVideoMuted must persist isRemoteVideoMuted on the controller (survives renderer re-attach " +
            "on ICE restart) AND forward it to the currently-attached renderer"
        )
    }

    func test_attachRenderer_appliesCurrentMuteStateBeforeAddingTrack() {
        let attachRange = Self.source.range(of: "func attachRenderer() {\n")
        XCTAssertNotNil(attachRange, "PiPCallController.attachRenderer() implementation must be present")
        guard let attachStart = attachRange?.lowerBound,
              let bodyEnd = Self.source.range(of: "\n    }", range: attachStart..<Self.source.endIndex) else {
            return XCTFail("Could not locate attachRenderer() body")
        }
        let body = Self.source[attachStart..<bodyEnd.lowerBound]
        guard let muteCallRange = body.range(of: "renderer.setRemoteVideoMuted(isRemoteVideoMuted)"),
              let addRange = body.range(of: "remoteTrack.add(renderer)") else {
            return XCTFail("attachRenderer must call renderer.setRemoteVideoMuted(isRemoteVideoMuted) before remoteTrack.add(renderer)")
        }
        XCTAssertLessThan(
            muteCallRange.lowerBound, addRange.lowerBound,
            "The mute state must be applied to a freshly-created renderer BEFORE it's attached to the track, " +
            "so a re-attach while the peer's camera is already off can't let a stray real frame through first"
        )
    }

    func test_tearDown_resetsRemoteVideoMutedState() {
        let teardownRange = Self.source.range(of: "func tearDown() {\n")
        guard let teardownStart = teardownRange?.lowerBound,
              let bodyEnd = Self.source.range(of: "\n    }", range: teardownStart..<Self.source.endIndex) else {
            return XCTFail("Could not locate tearDown() body")
        }
        let body = Self.source[teardownStart..<bodyEnd.lowerBound]
        XCTAssertTrue(
            body.contains("isRemoteVideoMuted = false"),
            "tearDown() must reset isRemoteVideoMuted — PiPCallController is a singleton, so a call that ended " +
            "with the peer's camera off must not leak that state into the next call's PiP"
        )
    }

    // MARK: - Rotation wiring (PiPVideoRenderer.onRotation → surfaceView.applyRotation)

    func test_attachRenderer_wiresOnRotationToSurfaceViewApplyRotation() {
        // PiPVideoRenderer enqueues the raw, unrotated pixel buffer (unlike
        // WebRTC's own RTCMTLVideoView) — without forwarding onRotation to
        // PiPVideoSampleBufferView.applyRotation, the system PiP window renders
        // a portrait-held remote camera sideways.
        let attachRange = Self.source.range(of: "func attachRenderer() {\n")
        XCTAssertNotNil(attachRange, "PiPCallController.attachRenderer() implementation must be present")
        guard let attachStart = attachRange?.lowerBound,
              let bodyEnd = Self.source.range(of: "\n    }", range: attachStart..<Self.source.endIndex) else {
            return XCTFail("Could not locate attachRenderer() body")
        }
        let body = Self.source[attachStart..<bodyEnd.lowerBound]
        XCTAssertTrue(
            body.contains("onRotation:"),
            "attachRenderer() must pass an onRotation callback to PiPVideoRenderer"
        )
        XCTAssertTrue(
            body.contains("surfaceView.applyRotation(degrees)"),
            "The onRotation callback must forward the rotation degrees to surfaceView.applyRotation so the PiP window compensates for the remote camera's orientation"
        )
    }
}
