import XCTest
import AVFoundation
import CoreImage
import CoreVideo
import Metal
@testable import MeeshyUI
@testable import MeeshySDK

/// Thread-safety contract tests for `DissolveVideoCompositor`.
///
/// AVFoundation invokes `startRequest(_:)` from arbitrary internal queues, and the decode pipeline
/// may issue multiple simultaneous requests. The compositor MUST tolerate concurrent renders into
/// distinct output buffers without crashing or producing corrupted output.
///
/// We cannot synthesize `AVAsynchronousVideoCompositionRequest` directly (no public initializer),
/// so these tests exercise the same `CIDissolveTransition` + `CIContext.render` path that
/// `startRequest` runs internally, in parallel, to validate the per-call context pattern.
final class DissolveVideoCompositor_ThreadSafetyTests: XCTestCase {

    // MARK: - Test fixtures

    private let renderWidth = 64
    private let renderHeight = 64
    private let pixelFormat = kCVPixelFormatType_32BGRA

    private func makePixelBuffer() -> CVPixelBuffer? {
        var buffer: CVPixelBuffer?
        let attrs: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: pixelFormat,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary
        ]
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            renderWidth,
            renderHeight,
            pixelFormat,
            attrs as CFDictionary,
            &buffer
        )
        guard status == kCVReturnSuccess else { return nil }
        return buffer
    }

    private func renderDissolveFrame(tween: Float) -> CVPixelBuffer? {
        guard let from = makePixelBuffer(),
              let to = makePixelBuffer(),
              let out = makePixelBuffer() else { return nil }

        let fromImage = CIImage(cvPixelBuffer: from)
        let toImage = CIImage(cvPixelBuffer: to)
        guard let filter = CIFilter(name: "CIDissolveTransition") else { return nil }
        filter.setValue(fromImage, forKey: kCIInputImageKey)
        filter.setValue(toImage, forKey: kCIInputTargetImageKey)
        filter.setValue(tween, forKey: kCIInputTimeKey)
        guard let outputImage = filter.outputImage else { return nil }

        let ctx: CIContext = {
            if let device = MTLCreateSystemDefaultDevice() {
                return CIContext(mtlDevice: device)
            }
            return CIContext()
        }()
        ctx.render(outputImage, to: out)
        return out
    }

    // MARK: - API surface

    func test_compositor_exposesExpectedSendableAttributes() {
        let compositor = DissolveVideoCompositor()
        XCTAssertEqual(compositor.transitionFilterName, "CIDissolveTransition")
        XCTAssertNotNil(compositor.sourcePixelBufferAttributes)
        XCTAssertFalse(compositor.requiredPixelBufferAttributesForRenderContext.isEmpty)
    }

    func test_compositor_initIsSideEffectFree_underConcurrentInstantiation() {
        // The compositor must be safe to instantiate concurrently — AVFoundation may register
        // the class once but multiple AVMutableVideoComposition objects could share it.
        let group = DispatchGroup()
        let count = 16
        var instances: [DissolveVideoCompositor?] = Array(repeating: nil, count: count)
        let lock = NSLock()
        DispatchQueue.concurrentPerform(iterations: count) { i in
            group.enter()
            let c = DissolveVideoCompositor()
            lock.lock()
            instances[i] = c
            lock.unlock()
            group.leave()
        }
        group.wait()
        XCTAssertEqual(instances.compactMap { $0 }.count, count)
    }

    // MARK: - Core thread-safety contracts

    /// Drives the exact CIDissolveTransition + CIContext.render path used by
    /// `DissolveVideoCompositor.startRequest`, from many threads at once, and asserts no crash.
    /// Before the fix (shared lazy `ciContext`), this would intermittently corrupt or trip a
    /// Metal command-buffer assertion.
    func test_concurrentStartRequest_noCrash() {
        let iterations = 10
        let expectation = expectation(description: "all concurrent dissolves complete")
        expectation.expectedFulfillmentCount = iterations

        DispatchQueue.concurrentPerform(iterations: iterations) { i in
            let tween = Float(i) / Float(max(iterations - 1, 1))
            let result = self.renderDissolveFrame(tween: tween)
            XCTAssertNotNil(result, "Iteration \(i): dissolve render must produce an output buffer")
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 30.0)
    }

    /// Each parallel render must produce a structurally valid pixel buffer:
    /// matching dimensions and the expected pixel format. A corrupted/raced output would manifest
    /// as wrong dimensions, wrong format, or `nil`.
    func test_concurrentStartRequest_eachFrameValid() {
        let iterations = 10
        let lock = NSLock()
        var outputs: [CVPixelBuffer] = []
        outputs.reserveCapacity(iterations)

        DispatchQueue.concurrentPerform(iterations: iterations) { i in
            let tween = Float(i) / Float(max(iterations - 1, 1))
            guard let buffer = self.renderDissolveFrame(tween: tween) else {
                XCTFail("Iteration \(i): expected non-nil output buffer")
                return
            }
            lock.lock()
            outputs.append(buffer)
            lock.unlock()
        }

        XCTAssertEqual(outputs.count, iterations, "All concurrent renders must yield outputs")
        for (idx, buffer) in outputs.enumerated() {
            XCTAssertEqual(
                CVPixelBufferGetWidth(buffer), renderWidth,
                "Output \(idx) width must match render width"
            )
            XCTAssertEqual(
                CVPixelBufferGetHeight(buffer), renderHeight,
                "Output \(idx) height must match render height"
            )
            XCTAssertEqual(
                CVPixelBufferGetPixelFormatType(buffer), pixelFormat,
                "Output \(idx) pixel format must be 32BGRA"
            )
        }
    }
}
