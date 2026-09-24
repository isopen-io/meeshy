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
/// pipeline. `CIContext` is immutable once built and documented thread-safe by Apple ("CIContext and
/// CIImage objects are immutable, which means each can be shared safely among threads"), so ONE
/// Metal-backed context is built per compositor and shared by every frame. Building a context per
/// frame (the previous design) re-created its command queue, caches and pipeline 30–60 times a
/// second — the cost Apple's Core Image guidance tells callers to pay once. The historical crash
/// came from a `lazy var` context, whose first access is itself a data race; a `let` initialised
/// in `init` is not.
public final class DissolveVideoCompositor: NSObject, AVVideoCompositing, @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

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

    /// One Metal-backed `CIContext` shared by every frame (see the thread-safety note above). Falls
    /// back to a software `CIContext()` on Metal-less hosts (e.g. some CI runners).
    private nonisolated let ciContext: CIContext = {
        if let device = MTLCreateSystemDefaultDevice() {
            return CIContext(mtlDevice: device)
        }
        return CIContext()
    }()

    // MARK: - AVVideoCompositing

    public func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
        // No-op: we recreate CIImage from pixel buffers each frame, no cached render context state.
    }

    public func startRequest(_ asyncVideoCompositionRequest: AVAsynchronousVideoCompositionRequest) {
        guard let outputBuffer = asyncVideoCompositionRequest.renderContext.newPixelBuffer() else {
            asyncVideoCompositionRequest.finish(with: makeCompositorError("No output pixel buffer"))
            return
        }

        let trackIDs = asyncVideoCompositionRequest.sourceTrackIDs
        guard trackIDs.count >= 2,
              let fromBuffer = asyncVideoCompositionRequest.sourceFrame(byTrackID: trackIDs[0].int32Value),
              let toBuffer = asyncVideoCompositionRequest.sourceFrame(byTrackID: trackIDs[1].int32Value)
        else {
            // Single track or missing buffers — pass through source frame as-is
            if let trackID = trackIDs.first,
               let sourceBuffer = asyncVideoCompositionRequest.sourceFrame(byTrackID: trackID.int32Value) {
                copyPixelBuffer(sourceBuffer, to: outputBuffer)
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

    private func copyPixelBuffer(_ source: CVPixelBuffer, to destination: CVPixelBuffer) {
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
