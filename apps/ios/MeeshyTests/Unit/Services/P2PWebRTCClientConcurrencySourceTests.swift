//
//  P2PWebRTCClientConcurrencySourceTests.swift
//  MeeshyTests
//
//  Source-level regression guard for the camera sessionGeneration race: P2PWebRTCClient
//  is not @MainActor, and RTCCameraVideoCapturer.startCapture's completion (the async
//  bridge) can resume on whatever queue AVCaptureSession used internally, NOT
//  necessarily MainActor — while disconnect() (always MainActor-isolated) mutates the
//  same sessionGeneration/videoCapturer vars synchronously. Every generation
//  check-and-mutate after an `await capturer.startCapture(...)` must therefore be
//  re-hopped onto MainActor via `MainActor.run` so it can never interleave with
//  disconnect(). Not exercised behaviorally (RTCCameraVideoCapturer needs real
//  hardware/capture session), so this guards the fix at the source level.
//

import XCTest
@testable import Meeshy

@MainActor
final class P2PWebRTCClientConcurrencySourceTests: XCTestCase {

    private static let source: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    private func body(from startMarker: String, to endMarker: String) throws -> String {
        XCTAssertFalse(Self.source.isEmpty, "Could not read P2PWebRTCClient.swift")
        guard let start = Self.source.range(of: startMarker) else {
            throw XCTSkip("\(startMarker) not found — file structure changed")
        }
        let end = Self.source.range(
            of: endMarker,
            range: start.upperBound..<Self.source.endIndex
        )?.lowerBound ?? Self.source.endIndex
        return String(Self.source[start.lowerBound..<end])
    }

    func test_buildLocalVideoTrackAndStartCapture_reHopsGenerationCheckToMainActor() throws {
        let fn = try body(
            from: "private func buildLocalVideoTrackAndStartCapture()",
            to: "private func applyAudioCodecPreferences"
        )
        XCTAssertTrue(
            fn.contains("try await capturer.startCapture(with: camera, format: format, fps: fps)"),
            "startCapture call site moved — update the marker"
        )
        XCTAssertTrue(
            fn.contains("await MainActor.run"),
            "the post-startCapture sessionGeneration check must be re-hopped onto MainActor — " +
            "the async completion can resume off-main while disconnect() mutates the same vars " +
            "synchronously on MainActor."
        )
    }

    func test_restartCapturerIfStopped_reHopsGenerationCheckToMainActor() throws {
        let fn = try body(
            from: "private func restartCapturerIfStopped()",
            to: "func switchCamera()"
        )
        XCTAssertTrue(
            fn.contains("await MainActor.run { generation != sessionGeneration }"),
            "restartCapturerIfStopped must compare sessionGeneration on MainActor after the await."
        )
    }

    func test_switchCamera_reHopsGenerationCheckToMainActor() throws {
        let fn = try body(from: "func switchCamera() async throws {", to: "func availableCameras()")
        XCTAssertTrue(
            fn.contains("await MainActor.run { generation != sessionGeneration }"),
            "switchCamera must compare sessionGeneration on MainActor after the await."
        )
    }

    func test_switchToCamera_reHopsGenerationCheckToMainActor() throws {
        let fn = try body(from: "func switchToCamera(uniqueID: String)", to: "func getStats()")
        XCTAssertTrue(
            fn.contains("await MainActor.run { generation != sessionGeneration }"),
            "switchToCamera must compare sessionGeneration on MainActor after the await."
        )
    }

    // P2PWebRTCClient is not @MainActor, so a bare `Task { [weak self] in ... }` created
    // from one of its synchronous, non-isolated methods runs on the cooperative pool —
    // not necessarily serialized with disconnect()'s synchronous property mutations.
    // These three unstructured tasks must pin themselves to MainActor explicitly.

    func test_toggleVideo_pinsUnstructuredTaskToMainActor() throws {
        let fn = try body(from: "func toggleVideo(_ enabled: Bool)", to: "var hasLocalVideoTrack")
        XCTAssertTrue(
            fn.contains("toggleVideoTask = Task { @MainActor [weak self] in"),
            "toggleVideo's capturer-restart task must run on @MainActor, serialized with disconnect()."
        )
    }

    func test_startDataChannelPing_pinsUnstructuredTaskToMainActor() throws {
        let fn = try body(from: "private func startDataChannelPing()", to: "private func stopDataChannelPing()")
        XCTAssertTrue(
            fn.contains("dataChannelPingTask = Task { @MainActor [weak self] in"),
            "startDataChannelPing's task must run on @MainActor, serialized with disconnect()."
        )
    }

    func test_disconnectAfterFlushingPendingSend_pinsUnstructuredTaskToMainActor() throws {
        let fn = try body(from: "func disconnectAfterFlushingPendingSend()", to: "deinit {")
        XCTAssertTrue(
            fn.contains("Task { @MainActor [weak self] in"),
            "disconnectAfterFlushingPendingSend's flush-and-disconnect task must run on @MainActor, " +
            "so its terminal disconnect() call can never race a fresh configure()/disconnect() pair."
        )
    }
}
