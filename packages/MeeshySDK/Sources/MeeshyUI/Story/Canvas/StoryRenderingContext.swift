import Foundation
import CoreImage
import Metal

/// Shared rendering context for the Story canvas pipeline.
///
/// Holds a single Metal device + Display P3 working `CIContext`, used by every
/// CALayer-backed canvas surface (composer Edit, composer Play, viewer, AVFoundation
/// custom compositor) so the rendered output is bit-exact across all surfaces.
public final class StoryRenderingContext: @unchecked Sendable {
    // `nonisolated` is required because MeeshyUI compiles with
    // `defaultIsolation(MainActor)` — without these annotations the singleton
    // and its stored properties would be inferred as `@MainActor`, even though
    // the underlying Metal device + CIContext are intentionally thread-safe.
    public nonisolated static let shared = StoryRenderingContext()

    public nonisolated let metalDevice: MTLDevice
    public nonisolated let commandQueue: MTLCommandQueue
    public nonisolated let ciContext: CIContext
    public nonisolated let workingColorSpace: CGColorSpace
    public nonisolated let outputColorSpace: CGColorSpace

    private nonisolated init() {
        guard let device = MTLCreateSystemDefaultDevice() else {
            fatalError("Metal device unavailable — Story canvas requires Metal")
        }
        self.metalDevice = device

        guard let queue = device.makeCommandQueue() else {
            fatalError("Metal command queue allocation failed")
        }
        self.commandQueue = queue

        self.workingColorSpace = CGColorSpace(name: CGColorSpace.displayP3) ?? CGColorSpaceCreateDeviceRGB()
        self.outputColorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()

        let options: [CIContextOption: Any] = [
            .workingColorSpace: workingColorSpace,
            .outputColorSpace: outputColorSpace,
            .useSoftwareRenderer: false,
            .workingFormat: CIFormat.RGBAh,
            .cacheIntermediates: true
        ]
        self.ciContext = CIContext(mtlDevice: device, options: options)
    }
}
