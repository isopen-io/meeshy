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
            fn.contains("await MainActor.run { generation != self.sessionGeneration }"),
            "restartCapturerIfStopped must compare sessionGeneration on MainActor after the await."
        )
    }

    func test_switchCamera_reHopsGenerationCheckToMainActor() throws {
        let fn = try body(from: "func switchCamera() async throws {", to: "func availableCameras()")
        XCTAssertTrue(
            fn.contains("await MainActor.run { generation != self.sessionGeneration }"),
            "switchCamera must compare sessionGeneration on MainActor after the await."
        )
    }

    func test_switchToCamera_reHopsGenerationCheckToMainActor() throws {
        let fn = try body(from: "func switchToCamera(uniqueID: String)", to: "func getStats()")
        XCTAssertTrue(
            fn.contains("await MainActor.run { generation != self.sessionGeneration }"),
            "switchToCamera must compare sessionGeneration on MainActor after the await."
        )
    }
}
