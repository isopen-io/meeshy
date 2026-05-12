import AVFoundation
import CoreImage
import CoreVideo
import Metal

// MARK: - DissolveVideoCompositor

/// Custom AVFoundation video compositor that applies `CIDissolveTransition` (GPU, via Metal CIContext)
/// for dissolve-kind `StoryClipTransition`s. Attached to an `AVMutableVideoComposition` only when
/// at least one dissolve transition is present in the project.
///
/// `@unchecked Sendable` is required because `AVVideoCompositing` conformance requires NSObject, and
/// AVFoundation calls compositor methods from arbitrary queues (not necessarily the main actor).
///
/// Thread-safety: `startRequest` is invoked concurrently from AVFoundation's internal decode/render
/// pipeline. A single shared `CIContext` is NOT safe to use across simultaneous `render(_:to:)`
/// calls — two concurrent renders into different output buffers may corrupt internal Metal command
/// buffer state. This compositor therefore creates a per-call `CIContext` bound to a shared,
/// immutable `MTLDevice` (Apple caches the default device process-wide, so the construction cost is
/// dominated by `CIContext` setup, not Metal driver bring-up).
public final class DissolveVideoCompositor: NSObject, AVVideoCompositing, @unchecked Sendable {

    // MARK: - Public

    public let transitionFilterName: String = "CIDissolveTransition"

    // MARK: - AVVideoCompositing required properties

    public var sourcePixelBufferAttributes: [String: any Sendable]? = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    public var requiredPixelBufferAttributesForRenderContext: [String: any Sendable] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    // MARK: - Private

    /// Shared Metal device. `MTLCreateSystemDefaultDevice()` returns a cached, process-wide instance,
    /// so storing it once is safe and avoids paying its (modest) cost per frame. The device itself is
    /// thread-safe and immutable. `nil` only on Metal-less hosts (e.g. some CI runners) — in that
    /// case `startRequest` falls back to a software `CIContext()`.
    private let device: MTLDevice? = MTLCreateSystemDefaultDevice()

    // MARK: - AVVideoCompositing

    public func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
        // No-op: we recreate CIImage from pixel buffers each frame, no cached render context state.
    }

    public func startRequest(_ asyncVideoCompositionRequest: AVAsynchronousVideoCompositionRequest) {
        guard let outputBuffer = asyncVideoCompositionRequest.renderContext.newPixelBuffer() else {
            asyncVideoCompositionRequest.finish(with: makeCompositorError("No output pixel buffer"))
            return
        }

        let ciContext = makeCIContext()

        let trackIDs = asyncVideoCompositionRequest.sourceTrackIDs
        guard trackIDs.count >= 2,
              let fromBuffer = asyncVideoCompositionRequest.sourceFrame(byTrackID: trackIDs[0].int32Value),
              let toBuffer = asyncVideoCompositionRequest.sourceFrame(byTrackID: trackIDs[1].int32Value)
        else {
            // Single track or missing buffers — pass through source frame as-is
            if let trackID = trackIDs.first,
               let sourceBuffer = asyncVideoCompositionRequest.sourceFrame(byTrackID: trackID.int32Value) {
                copyPixelBuffer(sourceBuffer, to: outputBuffer, using: ciContext)
            }
            asyncVideoCompositionRequest.finish(withComposedVideoFrame: outputBuffer)
            return
        }

        let elapsed = CMTimeSubtract(
            asyncVideoCompositionRequest.compositionTime,
            asyncVideoCompositionRequest.videoCompositionInstruction.timeRange.start
        )
        let duration = asyncVideoCompositionRequest.videoCompositionInstruction.timeRange.duration
        let tweenFactor: Float
        if duration.seconds > 0 {
            tweenFactor = Float((elapsed.seconds / duration.seconds).clamped(to: 0...1))
        } else {
            tweenFactor = 1
        }

        let fromImage = CIImage(cvPixelBuffer: fromBuffer)
        let toImage = CIImage(cvPixelBuffer: toBuffer)

        guard let filter = CIFilter(name: transitionFilterName) else {
            asyncVideoCompositionRequest.finish(with: makeCompositorError("CIDissolveTransition unavailable"))
            return
        }
        filter.setValue(fromImage, forKey: kCIInputImageKey)
        filter.setValue(toImage, forKey: kCIInputTargetImageKey)
        filter.setValue(tweenFactor, forKey: kCIInputTimeKey)

        guard let outputImage = filter.outputImage else {
            asyncVideoCompositionRequest.finish(with: makeCompositorError("No output image from CIFilter"))
            return
        }

        ciContext.render(outputImage, to: outputBuffer)
        asyncVideoCompositionRequest.finish(withComposedVideoFrame: outputBuffer)
    }

    public func cancelAllPendingVideoCompositionRequests() {
        // No async queue in this simple sync compositor — nothing to cancel.
    }

    // MARK: - Private helpers

    /// Builds a fresh `CIContext` per `startRequest` invocation. The underlying `MTLDevice` is shared
    /// and immutable, so this is the minimal allocation needed to guarantee thread safety against
    /// concurrent calls from AVFoundation's decode pipeline.
    private func makeCIContext() -> CIContext {
        if let device {
            return CIContext(mtlDevice: device)
        }
        return CIContext()
    }

    private func copyPixelBuffer(_ source: CVPixelBuffer, to destination: CVPixelBuffer, using ciContext: CIContext) {
        let image = CIImage(cvPixelBuffer: source)
        ciContext.render(image, to: destination)
    }

    private func makeCompositorError(_ message: String) -> Error {
        NSError(
            domain: "me.meeshy.DissolveVideoCompositor",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

// MARK: - Double clamping helper

private extension Double {
    nonisolated func clamped(to range: ClosedRange<Double>) -> Double {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}
