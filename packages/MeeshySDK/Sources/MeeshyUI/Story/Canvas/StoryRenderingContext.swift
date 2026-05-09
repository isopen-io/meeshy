import Foundation
import CoreImage
import Metal

/// Shared rendering context for the Story canvas pipeline.
///
/// Holds a single Metal device + Display P3 working `CIContext`, used by every
/// CALayer-backed canvas surface (composer Edit, composer Play, viewer, AVFoundation
/// custom compositor) so the rendered output is bit-exact across all surfaces.
public final class StoryRenderingContext: @unchecked Sendable {
    public static let shared = StoryRenderingContext()

    public let metalDevice: MTLDevice
    public let ciContext: CIContext
    public let workingColorSpace: CGColorSpace
    public let outputColorSpace: CGColorSpace

    private init() {
        guard let device = MTLCreateSystemDefaultDevice() else {
            fatalError("Metal device unavailable — Story canvas requires Metal")
        }
        self.metalDevice = device

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
