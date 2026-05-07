import AVFoundation
import Metal
import MetalKit

/// Custom `AVVideoCompositing` implementation reserved for future non-opacity
/// transitions (`push`, `wipe`, `zoom`, `swipe`).
///
/// At launch, this compositor is REGISTERED on the `AVMutableVideoComposition`
/// only when a `StoryClipTransition.kind` falls outside the built-in paths
/// already handled by `VideoCompositor`:
/// - `.crossfade` → `setOpacityRamp(...)` (no custom compositor, native AVFoundation)
/// - `.dissolve`  → `CIDissolveTransition` via `CIFilter` (no custom compositor)
///
/// Adding a new transition kind = adding a new case in `startRequest` + a Metal
/// compute kernel. NO refactor of `VideoCompositor` is required.
@objc public final class CustomTransitionCompositor: NSObject, AVVideoCompositing, @unchecked Sendable {

    public var sourcePixelBufferAttributes: [String: any Sendable]? = [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferMetalCompatibilityKey as String: true,
    ]

    public var requiredPixelBufferAttributesForRenderContext: [String: any Sendable] = [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferMetalCompatibilityKey as String: true,
    ]

    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue

    /// Returns `true` when a Metal-capable GPU is available on this device.
    /// `VideoCompositor.makeComposition` MUST check this before assigning
    /// `customVideoCompositorClass = CustomTransitionCompositor.self` so that
    /// Metal-less devices (or unit-test hosts without GPU) never reach the init.
    public static var isMetalAvailable: Bool {
        MTLCreateSystemDefaultDevice() != nil
    }

    /// AVFoundation requires a non-failable `init()` for `customVideoCompositorClass`
    /// registration. This init is an unreachable contract on production devices:
    /// `VideoCompositor.makeComposition` gates registration on `isMetalAvailable`.
    /// Hitting `preconditionFailure` here means the guard was bypassed — a
    /// programmer error, not a runtime condition.
    public override init() {
        guard let device = MTLCreateSystemDefaultDevice(),
              let queue = device.makeCommandQueue() else {
            preconditionFailure(
                "CustomTransitionCompositor: Metal is unavailable. " +
                "VideoCompositor.makeComposition must check isMetalAvailable " +
                "before registering this compositor class."
            )
        }
        self.device = device
        self.commandQueue = queue
        super.init()
    }

    public func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
        // No-op stub.
    }

    public func startRequest(_ asyncVideoCompositionRequest: AVAsynchronousVideoCompositionRequest) {
        // STUB: at launch this compositor is never reached because
        // VideoCompositor.makeComposition only registers it when a non-built-in
        // StoryTransitionKind is present.
        asyncVideoCompositionRequest.finish(with: NSError(
            domain: "CustomTransitionCompositor",
            code: -1,
            userInfo: [NSLocalizedDescriptionKey: "No custom transition kind active at launch"]
        ))
    }

    public func cancelAllPendingVideoCompositionRequests() {
        // No-op stub.
    }
}
