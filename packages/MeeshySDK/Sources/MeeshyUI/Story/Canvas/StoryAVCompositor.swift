import AVFoundation
import CoreMedia
import QuartzCore
import UIKit
import MeeshySDK

/// Custom video compositor that draws each export frame using the same shared
/// `StoryRenderer.render()` consumed by the live composer/viewer canvas.
///
/// Bit-exact equivalence rationale: AVFoundation invokes `startRequest(_:)`
/// on its own worker queue. `StoryRenderer.render` is `@MainActor`-isolated
/// because the CALayer subclasses it instantiates touch `UIScreen.main.scale`
/// and `AVPlayer` at configure time. We bridge the worker thread to the main
/// actor for the duration of one frame via `DispatchQueue.main.sync` +
/// `MainActor.assumeIsolated`.
///
/// Concurrency caveat:
///   `StoryExporter.export()` MUST NOT be called from `MainActor` synchronously
///   (e.g. inside a `DispatchQueue.main.sync` block) — that would deadlock when
///   the worker thread tries to bridge back to main. Always call from a `Task`.
public final class StoryAVCompositor: NSObject, nonisolated AVVideoCompositing, @unchecked Sendable {

    private nonisolated let contextQueue = DispatchQueue(label: "me.meeshy.story.compositor.context")
    private nonisolated(unsafe) var _renderContext: AVVideoCompositionRenderContext?
    private nonisolated(unsafe) var _shouldCancelAllRequests = false

    public override nonisolated init() {
        super.init()
    }

    public nonisolated let sourcePixelBufferAttributes: [String: any Sendable]? = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    public nonisolated let requiredPixelBufferAttributesForRenderContext: [String: any Sendable] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]

    public nonisolated func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
        contextQueue.sync { _renderContext = newRenderContext }
    }

    public nonisolated func cancelAllPendingVideoCompositionRequests() {
        contextQueue.sync { _shouldCancelAllRequests = true }
        contextQueue.sync { _shouldCancelAllRequests = false }
    }

    public nonisolated func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        let cancelled = contextQueue.sync { _shouldCancelAllRequests }
        if cancelled {
            request.finishCancelledRequest()
            return
        }
        guard let renderContext = contextQueue.sync(execute: { _renderContext }) else {
            request.finish(with: NSError(domain: "StoryAVCompositor", code: -1,
                                          userInfo: [NSLocalizedDescriptionKey: "No render context"]))
            return
        }
        guard let instruction = request.videoCompositionInstruction as? StoryCompositionInstruction else {
            request.finish(with: NSError(domain: "StoryAVCompositor", code: -2,
                                          userInfo: [NSLocalizedDescriptionKey: "Unsupported instruction"]))
            return
        }
        guard let buffer = renderContext.newPixelBuffer() else {
            request.finish(with: NSError(domain: "StoryAVCompositor", code: -3,
                                          userInfo: [NSLocalizedDescriptionKey: "Pixel buffer alloc failed"]))
            return
        }

        // The pixel buffer is produced and consumed on the main actor (where
        // StoryRenderer.render runs) — finishing the request from inside the
        // bridged main-actor block keeps `buffer` from crossing isolation
        // boundaries (CVPixelBuffer is not Sendable in Swift 6).
        DispatchQueue.main.sync {
            MainActor.assumeIsolated {
                do {
                    try Self.renderFrame(slide: instruction.slide,
                                         at: request.compositionTime,
                                         renderSize: renderContext.size,
                                         into: buffer)
                    request.finish(withComposedVideoFrame: buffer)
                } catch {
                    request.finish(with: error)
                }
            }
        }
    }

    @MainActor
    private static func renderFrame(slide: StorySlide,
                                    at time: CMTime,
                                    renderSize: CGSize,
                                    into buffer: CVPixelBuffer) throws {
        let geometry = CanvasGeometry(renderSize: renderSize)
        let layer = StoryRenderer.render(slide: slide,
                                          into: geometry,
                                          at: time,
                                          mode: .play)

        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

        let width = CVPixelBufferGetWidth(buffer)
        let height = CVPixelBufferGetHeight(buffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        guard let baseAddress = CVPixelBufferGetBaseAddress(buffer) else {
            throw NSError(domain: "StoryAVCompositor", code: -4,
                          userInfo: [NSLocalizedDescriptionKey: "No base address"])
        }

        // 32BGRA = byte order little-endian + premultiplied first alpha.
        // Without `byteOrder32Little`, CoreGraphics interprets bytes in big-endian
        // order (ARGB) and channels come out swapped (red↔blue).
        let bitmapInfo = CGImageByteOrderInfo.order32Little.rawValue
            | CGImageAlphaInfo.premultipliedFirst.rawValue

        guard let cg = CGContext(data: baseAddress,
                                  width: width,
                                  height: height,
                                  bitsPerComponent: 8,
                                  bytesPerRow: bytesPerRow,
                                  space: StoryRenderingContext.shared.workingColorSpace,
                                  bitmapInfo: bitmapInfo) else {
            throw NSError(domain: "StoryAVCompositor", code: -5,
                          userInfo: [NSLocalizedDescriptionKey: "CGContext creation failed"])
        }

        // CALayer renders in UIKit top-down coordinates ; CGContext defaults to
        // bottom-up. Flip Y so the buffer lays out frames upright.
        cg.translateBy(x: 0, y: CGFloat(height))
        cg.scaleBy(x: 1, y: -1)

        layer.render(in: cg)
    }
}

/// Composition instruction carrying the `StorySlide` whose frame at any given
/// `CMTime` is delegated to `StoryRenderer.render` by `StoryAVCompositor`.
public final class StoryCompositionInstruction: NSObject,
                                                 AVVideoCompositionInstructionProtocol,
                                                 @unchecked Sendable {
    public let slide: StorySlide
    public let timeRange: CMTimeRange
    public let enablePostProcessing: Bool = false
    public let containsTweening: Bool = true
    public let requiredSourceTrackIDs: [NSValue]? = nil
    public let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid

    public nonisolated init(slide: StorySlide, timeRange: CMTimeRange) {
        self.slide = slide
        self.timeRange = timeRange
        super.init()
    }
}
