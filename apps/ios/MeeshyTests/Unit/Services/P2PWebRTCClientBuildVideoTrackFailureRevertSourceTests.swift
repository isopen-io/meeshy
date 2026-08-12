//
//  P2PWebRTCClientBuildVideoTrackFailureRevertSourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard: `P2PWebRTCClient.buildLocalVideoTrackAndStartCapture()`
//  sets `localVideoTrack_`, `videoCapturer` and `videoFilterDelegate` BEFORE picking a
//  capture device / format and starting capture. The three failure points past that —
//  no capture device available, no usable format, and `capturer.startCapture` itself
//  failing on real hardware (camera busy, single-camera device, AVCaptureSession
//  configuration error) — used to throw with those properties left set.
//
//  `hasLocalVideoTrack` is deliberately keyed off `localVideoTrack_?.isEnabled`, not a
//  nil-check (see its doc-comment) — but `videoTrack.isEnabled = true` runs unconditionally
//  right after the track is created, before any of the three failure points. So a failure
//  here left `hasLocalVideoTrack` reporting `true` to every caller (toggleVideo's catch
//  blocks, unhold video recovery, CallView's self-preview gate and `effectiveSwapStreams`)
//  even though this capturer never captured a single frame — a UI/capture desync that
//  never self-corrected for the rest of the call. Companion fix to the identical class of
//  bug already corrected in `switchCamera()` (see
//  P2PWebRTCClientSwitchCameraFailureRevertSourceTests), applied here to the function that
//  builds local video from scratch (initial call setup + mid-call audio→video upgrade).
//
//  Not exercised behaviorally: `RTCCameraVideoCapturer`/`AVCaptureSession` need real
//  capture hardware, absent from the unit test host — same constraint documented by the
//  existing source-guards in this file (P2PWebRTCClientConcurrencySourceTests,
//  P2PWebRTCClientSwitchCameraFailureRevertSourceTests).
//

import XCTest
@testable import Meeshy

@MainActor
final class P2PWebRTCClientBuildVideoTrackFailureRevertSourceTests: XCTestCase {

    private static let source: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    /// Loud by construction: a missing start OR end marker fails the test via
    /// `XCTFail` (never a silent `XCTSkip`, which reads as green in CI) and the
    /// end marker is mandatory — no falling back to `source.endIndex` on a miss,
    /// which would silently widen the search window into unrelated code and let
    /// an assertion pass for the wrong reason.
    private func body(from startMarker: String, to endMarker: String, file: StaticString = #filePath, line: UInt = #line) -> String? {
        guard !Self.source.isEmpty else {
            XCTFail("Could not read P2PWebRTCClient.swift", file: file, line: line)
            return nil
        }
        guard let start = Self.source.range(of: startMarker) else {
            XCTFail("Start marker not found — file structure changed: \"\(startMarker)\"", file: file, line: line)
            return nil
        }
        guard let end = Self.source.range(of: endMarker, range: start.upperBound..<Self.source.endIndex) else {
            XCTFail("End marker not found — file structure changed: \"\(endMarker)\"", file: file, line: line)
            return nil
        }
        return String(Self.source[start.lowerBound..<end.lowerBound])
    }

    private func fetchFunctionBody() -> String? {
        body(from: "private func buildLocalVideoTrackAndStartCapture() async throws {", to: "private func applyAudioCodecPreferences")
    }

    func test_buildLocalVideoTrackAndStartCapture_wrapsDeviceFormatAndStartCaptureInDoCatch() {
        guard let fn = fetchFunctionBody() else { return }
        XCTAssertTrue(
            fn.contains("throw WebRTCError.noCameraAvailable"),
            "no-camera guard moved or renamed — update the marker"
        )
        XCTAssertTrue(
            fn.contains("throw WebRTCError.noCameraFormatAvailable"),
            "no-format guard moved or renamed — update the marker"
        )
        XCTAssertTrue(
            fn.contains("try await capturer.startCapture(with: camera, format: format, fps: fps)"),
            "startCapture call site moved — update the marker"
        )
        // All three failure points must sit between "do {" and the catch that
        // reverts local video state — a guard-throw or startCapture hoisted back
        // above the `do` (or below the `catch`) would bypass the revert entirely.
        guard let doRange = fn.range(of: "do {"),
              let catchRange = fn.range(of: "} catch {", range: doRange.upperBound..<fn.endIndex) else {
            XCTFail("do { ... } catch { block not found around device/format/startCapture")
            return
        }
        let guarded = String(fn[doRange.upperBound..<catchRange.lowerBound])
        XCTAssertTrue(guarded.contains("throw WebRTCError.noCameraAvailable"),
            "no-camera guard must be inside the do block so its failure reverts local video state")
        XCTAssertTrue(guarded.contains("throw WebRTCError.noCameraFormatAvailable"),
            "no-format guard must be inside the do block so its failure reverts local video state")
        XCTAssertTrue(guarded.contains("try await capturer.startCapture(with: camera, format: format, fps: fps)"),
            "startCapture must be inside the do block so its failure reverts local video state")
    }

    func test_buildLocalVideoTrackAndStartCapture_catchRevertsLocalVideoStateBeforeRethrow() {
        guard let fn = fetchFunctionBody() else { return }
        guard let catchRange = fn.range(of: "} catch {") else {
            XCTFail("catch block not found — update the marker")
            return
        }
        let catchBody = String(fn[catchRange.upperBound...])
        XCTAssertTrue(
            catchBody.contains("if videoCapturer === capturer {"),
            "catch must guard the revert on identity — a concurrent disconnect()/new call " +
            "may already have replaced videoCapturer/localVideoTrack_ with its own."
        )
        XCTAssertTrue(
            catchBody.contains("localVideoTrack_ = nil") &&
            catchBody.contains("videoCapturer = nil") &&
            catchBody.contains("videoFilterDelegate = nil"),
            "catch must nil out localVideoTrack_/videoCapturer/videoFilterDelegate — otherwise " +
            "hasLocalVideoTrack (keyed off localVideoTrack_?.isEnabled) keeps reporting true " +
            "after a build failure even though no camera ever captured a frame."
        )
        XCTAssertTrue(
            catchBody.contains("throw error"),
            "catch must rethrow the original error after reverting — callers (startLocalMedia, " +
            "enableLocalVideo) rely on the typed error to decide the audio-only fallback."
        )
    }

    func test_buildLocalVideoTrackAndStartCapture_staleCleanupBelowIsUnaffected() {
        // Regression guard: the pre-existing isStale cleanup (a DIFFERENT case — the
        // session changed during warm-up, not a hardware failure) must still run its
        // own identity-guarded nil-out independently of the new catch block, not be
        // folded into or replaced by it.
        guard let fn = fetchFunctionBody() else { return }
        let identityGuardedNilOuts = fn.components(separatedBy: "if videoCapturer === capturer {").count - 1
        XCTAssertEqual(
            identityGuardedNilOuts, 2,
            "expected 2 identity-guarded nil-out sites in buildLocalVideoTrackAndStartCapture: " +
            "the build-failure revert (new) + the isStale warm-up cleanup (pre-existing) — " +
            "found \(identityGuardedNilOuts). If this count changed intentionally, update this guard."
        )
        XCTAssertTrue(
            fn.contains("session changed during camera warm-up"),
            "isStale cleanup's warning log must still be present — this guard must not have " +
            "been removed or merged into the new failure-revert catch block."
        )
    }
}
