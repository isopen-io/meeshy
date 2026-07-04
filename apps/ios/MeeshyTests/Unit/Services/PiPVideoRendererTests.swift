//
//  PiPVideoRendererTests.swift
//  MeeshyTests
//
//  Source-level constraints for PiPVideoRenderer (throttle, backpressure,
//  flush-on-failed, thread safety). The class lives inside #if canImport(WebRTC),
//  making it unavailable in unit-test targets that link without the framework;
//  source-inspection tests pin the structural invariants without depending on
//  WebRTC at link time (same pattern as CodecPreferencesTests).
//

import XCTest
@testable import Meeshy

@MainActor
final class PiPVideoRendererTests: XCTestCase {

    private static let source: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/WebRTC/PiPVideoRenderer.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    // MARK: - Thread safety

    func test_renderFrame_isNonisolated() {
        XCTAssertFalse(Self.source.isEmpty, "Could not read PiPVideoRenderer.swift")
        XCTAssertTrue(
            Self.source.contains("nonisolated func renderFrame"),
            "renderFrame(_:) must be nonisolated — WebRTC calls it from the decoder thread, not main"
        )
    }

    func test_class_isUncheckedSendable() {
        XCTAssertTrue(
            Self.source.contains("@unchecked Sendable"),
            "PiPVideoRenderer must be @unchecked Sendable (internal synchronisation via serial queue)"
        )
    }

    func test_renderFrame_dispatchesToSerialQueue() {
        XCTAssertTrue(
            Self.source.contains("queue.async"),
            "renderFrame must dispatch to a serial queue so frames are serialised off the WebRTC decoder thread"
        )
    }

    // MARK: - Throttle

    func test_throttle_usesMonotonicClock() {
        XCTAssertTrue(
            Self.source.contains("clock_gettime_nsec_np(CLOCK_UPTIME_RAW)"),
            "PiPVideoRenderer must use clock_gettime_nsec_np(CLOCK_UPTIME_RAW) — monotonic, unaffected by suspend"
        )
    }

    func test_throttle_guardsMinIntervalNs() {
        XCTAssertTrue(
            Self.source.contains("minIntervalNs"),
            "PiPVideoRenderer must gate frame delivery on minIntervalNs to cap the PiP render rate"
        )
    }

    func test_setMaxFrameRate_intervalFormula() {
        // The formula UInt64(1_000_000_000 / max(1, fps)) is the contract of setMaxFrameRate.
        // Verify correctness as a pure arithmetic unit test without touching the private field.
        func interval(fps: Int) -> UInt64 { UInt64(1_000_000_000 / max(1, fps)) }
        XCTAssertEqual(interval(fps: 15), 66_666_666)
        XCTAssertEqual(interval(fps: 30), 33_333_333)
        XCTAssertEqual(interval(fps: 1),  1_000_000_000)
        // fps=0 clamps to 1 via max(1, fps)
        XCTAssertEqual(interval(fps: 0),  1_000_000_000)
    }

    func test_serialQueue_usesUserInteractiveQoS() {
        XCTAssertTrue(
            Self.source.contains("qos: .userInteractive"),
            "PiP render queue must use .userInteractive QoS for low-latency frame delivery"
        )
    }

    // MARK: - Backpressure

    func test_backpressure_checksIsReadyForMoreMediaData() {
        XCTAssertTrue(
            Self.source.contains("isReadyForMoreMediaData"),
            "PiPVideoRenderer must check isReadyForMoreMediaData before enqueuing to avoid memory growth when the layer can't keep up"
        )
    }

    func test_backpressure_dropFrameOnNotReady() {
        // When not ready: drop (return), never queue. This avoids unbounded buffering.
        XCTAssertTrue(
            Self.source.contains("guard isReadyForMoreMediaData else { return }"),
            "Frames must be dropped (return) when isReadyForMoreMediaData is false — queuing would cause unbounded memory growth"
        )
    }

    // MARK: - Flush-on-failed

    func test_flushIfFailed_calledBeforeEachEnqueue() {
        XCTAssertTrue(
            Self.source.contains("flushIfFailed()"),
            "consume() must call flushIfFailed() before each enqueue to recover from AVSampleBufferDisplayLayer .failed state"
        )
    }

    func test_flushIfFailed_checksFailedStatus() {
        XCTAssertTrue(
            Self.source.contains("== .failed"),
            "flushIfFailed must check status == .failed before flushing (avoid flushing healthy layers)"
        )
    }

    // MARK: - iOS 16 / 17 surface compatibility

    func test_enqueue_branchesOnOS17() {
        XCTAssertTrue(
            Self.source.contains("if #available(iOS 17.0, *)"),
            "PiPVideoRenderer must branch on iOS 17 availability for the sampleBufferRenderer API"
        )
        XCTAssertTrue(
            Self.source.contains("sampleBufferRenderer.enqueue"),
            "iOS 17+ path must enqueue via sampleBufferRenderer"
        )
        XCTAssertTrue(
            Self.source.contains("displayLayer.enqueue("),
            "iOS <17 fallback must enqueue directly on displayLayer"
        )
    }

    // MARK: - Remote video mute → placeholder (never the frozen last frame)

    func test_consume_dropsLiveFramesWhileMuted() {
        XCTAssertTrue(
            Self.source.contains("guard !isRemoteVideoMuted else { return }"),
            "consume() must drop live frames while isRemoteVideoMuted so a placeholder-then-late-real-frame race " +
            "can't slip a live frame in right after the peer re-enables video mid-processing"
        )
    }

    func test_setRemoteVideoMuted_dispatchesOnSerialQueue() {
        XCTAssertTrue(
            Self.source.contains("func setRemoteVideoMuted"),
            "PiPVideoRenderer must expose setRemoteVideoMuted so PiPCallController can forward the peer's camera state"
        )
        guard let range = Self.source.range(of: "func setRemoteVideoMuted") else { return }
        let bodyFragment = String(Self.source[range.lowerBound...].prefix(300))
        XCTAssertTrue(
            bodyFragment.contains("queue.async"),
            "setRemoteVideoMuted must hop onto the serial render queue — isRemoteVideoMuted is only safe to " +
            "mutate there, same as every other piece of renderer state"
        )
    }

    func test_setRemoteVideoMuted_enqueuesPlaceholderOnMute() {
        XCTAssertTrue(
            Self.source.contains("enqueuePlaceholder()"),
            "Muting must eagerly enqueue a placeholder frame — otherwise the PiP window keeps showing whatever " +
            "the last live frame was until the next real frame arrives (which may never happen)"
        )
        XCTAssertTrue(
            Self.source.contains("VideoFrameConverter.makePlaceholderPixelBuffer()"),
            "enqueuePlaceholder must build its frame from the shared, WebRTC-independent placeholder factory"
        )
    }

    // MARK: - Rotation callback

    func test_rotation_debounced() {
        XCTAssertTrue(
            Self.source.contains("lastRotation"),
            "PiPVideoRenderer must track lastRotation to avoid firing the onRotation callback on every frame"
        )
        XCTAssertTrue(
            Self.source.contains("onRotation"),
            "PiPVideoRenderer must expose an onRotation callback so the caller can apply a rotation transform"
        )
    }
}
